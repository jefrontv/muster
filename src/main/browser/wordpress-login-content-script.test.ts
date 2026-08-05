// @vitest-environment happy-dom
// Exercises the shipped content script directly so its guards cannot silently regress.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Reads the shipped artifact so the test fails if the extension we package changes behaviour.
const CONTENT_SCRIPT = readFileSync(
  path.join(
    process.cwd(),
    'resources',
    'browser-extensions',
    'wordpress-login-autofill',
    'content.js'
  ),
  'utf8'
)

function renderLoginPage(options: { withError?: boolean; prefilled?: boolean } = {}): void {
  document.body.innerHTML = `
    ${options.withError ? '<div id="login_error">Invalid password</div>' : ''}
    <form id="loginform">
      <input id="user_login" value="${options.prefilled ? 'someone' : ''}" />
      <input id="user_pass" value="" type="password" />
    </form>
  `
}

function setSearch(search: string): void {
  window.history.replaceState({}, '', `/wp-login.php${search}`)
}

function runContentScript(): void {
  // eslint-disable-next-line no-new-func -- running the shipped artifact is the point of this test
  new Function(CONTENT_SCRIPT)()
}

function fields(): { username: HTMLInputElement; password: HTMLInputElement } {
  return {
    username: document.getElementById('user_login') as HTMLInputElement,
    password: document.getElementById('user_pass') as HTMLInputElement
  }
}

describe('wordpress login autofill content script', () => {
  beforeEach(() => {
    setSearch('')
    document.body.innerHTML = ''
    ;(globalThis as Record<string, unknown>).__MUSTER_WP_LOGIN__ = {
      username: 'admin',
      password: 'secret',
      autoLogin: false
    }
  })

  it('fills both fields without submitting when auto-login is off', () => {
    renderLoginPage()
    const submit = vi.fn()
    ;(document.getElementById('loginform') as HTMLFormElement).submit = submit

    runContentScript()

    expect(fields().username.value).toBe('admin')
    expect(fields().password.value).toBe('secret')
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits when auto-login is on', () => {
    ;(globalThis as Record<string, unknown>).__MUSTER_WP_LOGIN__ = {
      username: 'admin',
      password: 'secret',
      autoLogin: true
    }
    renderLoginPage()
    const submit = vi.fn()
    ;(document.getElementById('loginform') as HTMLFormElement).submit = submit

    runContentScript()

    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the previous attempt failed', () => {
    ;(globalThis as Record<string, unknown>).__MUSTER_WP_LOGIN__ = {
      username: 'admin',
      password: 'secret',
      autoLogin: true
    }
    renderLoginPage({ withError: true })
    const submit = vi.fn()
    ;(document.getElementById('loginform') as HTMLFormElement).submit = submit

    runContentScript()

    // Refilling after #login_error is exactly how an autofill extension loops.
    expect(fields().username.value).toBe('')
    expect(submit).not.toHaveBeenCalled()
  })

  it('respects a deliberate logout', () => {
    setSearch('?loggedout=true')
    renderLoginPage()

    runContentScript()

    expect(fields().username.value).toBe('')
  })

  it('respects a re-auth prompt', () => {
    setSearch('?reauth=1')
    renderLoginPage()

    runContentScript()

    expect(fields().username.value).toBe('')
  })

  it('leaves a form the user already started alone', () => {
    renderLoginPage({ prefilled: true })

    runContentScript()

    expect(fields().username.value).toBe('someone')
    expect(fields().password.value).toBe('')
  })

  it('stays inert without configured credentials', () => {
    ;(globalThis as Record<string, unknown>).__MUSTER_WP_LOGIN__ = {
      username: '',
      password: '',
      autoLogin: true
    }
    renderLoginPage()
    const submit = vi.fn()
    ;(document.getElementById('loginform') as HTMLFormElement).submit = submit

    runContentScript()

    expect(fields().username.value).toBe('')
    expect(submit).not.toHaveBeenCalled()
  })
})
