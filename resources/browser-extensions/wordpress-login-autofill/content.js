// Fills the WordPress login form from the credentials Muster wrote into config.js.
//
// config.js is generated per install (see browser-extension-bundles.ts) and runs first in the
// same content_scripts entry, so credentials arrive without chrome.storage — Electron's storage
// support is partial, and Muster (not an extension popup) owns configuration.
;(function () {
  const config = globalThis.__MUSTER_WP_LOGIN__
  if (!config || !config.username || !config.password) {
    return
  }

  const params = new URLSearchParams(window.location.search)
  // A deliberate logout or a re-auth prompt must not be undone by autofill.
  if (params.get('loggedout') === 'true' || params.get('reauth') === '1') {
    return
  }

  const form = document.getElementById('loginform')
  // #login_error means the last attempt failed; refilling and resubmitting would loop.
  if (!form || document.getElementById('login_error')) {
    return
  }

  const usernameField = form.querySelector('#user_login')
  const passwordField = form.querySelector('#user_pass')
  if (!usernameField || !passwordField) {
    return
  }

  // Only fill an untouched form so a user mid-edit is never overwritten.
  if (usernameField.value || passwordField.value) {
    return
  }

  usernameField.value = config.username
  passwordField.value = config.password

  if (config.autoLogin === true) {
    form.submit()
  }
})()
