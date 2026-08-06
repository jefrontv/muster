<?php

/**
 * Release lookup and page helpers.
 *
 * Why any of this is server-side: link-preview crawlers (Slack, Teams, iMessage) do not run
 * JavaScript, so an og:image resolved in the browser never reaches them, and a version number
 * printed by JS never appears in the preview either. Both have to be in the delivered HTML.
 *
 * The GitHub call is cached on disk because the rate limit for unauthenticated requests is counted
 * against the SERVER's IP here, not each visitor's — without a cache a busy page would exhaust
 * sixty requests an hour and start showing nothing.
 */

declare(strict_types=1);

const MUSTER_REPO = 'jefrontv/muster';
const MUSTER_RELEASE_CACHE_TTL = 900; // 15 minutes
const MUSTER_RELEASE_TIMEOUT = 4;     // seconds; the page must never hang on GitHub

/** Escape for HTML text and attribute contexts. */
function e(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Absolute base URL of the directory this page is served from, with a trailing slash. */
function base_url(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');

    return $scheme . '://' . $host . $dir . '/';
}

function release_cache_path(): string
{
    return sys_get_temp_dir() . '/muster-release-' . md5(MUSTER_REPO) . '.json';
}

/** Reads the cache regardless of age. Used as a fallback when the network call fails. */
function read_release_cache(?int $maxAge = null): ?array
{
    $path = release_cache_path();
    if (!is_readable($path)) {
        return null;
    }
    if ($maxAge !== null && (time() - (int) filemtime($path)) > $maxAge) {
        return null;
    }
    $decoded = json_decode((string) file_get_contents($path), true);

    return is_array($decoded) ? $decoded : null;
}

function write_release_cache(array $release): void
{
    // Atomic replace so a concurrent read never sees a half-written file.
    $path = release_cache_path();
    $temp = $path . '.' . getmypid() . '.tmp';
    if (file_put_contents($temp, json_encode($release)) !== false) {
        @rename($temp, $path);
    }
}

function fetch_release_json(): ?array
{
    $url = 'https://api.github.com/repos/' . MUSTER_REPO . '/releases/latest';
    // GitHub rejects requests without a User-Agent.
    $headers = "User-Agent: muster-site\r\nAccept: application/vnd.github+json\r\n";
    $body = false;

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => MUSTER_RELEASE_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => MUSTER_RELEASE_TIMEOUT,
            CURLOPT_USERAGENT => 'muster-site',
            CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json'],
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        if ($status !== 200) {
            $body = false;
        }
    } elseif (filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOL)) {
        $context = stream_context_create([
            'http' => ['header' => $headers, 'timeout' => MUSTER_RELEASE_TIMEOUT, 'ignore_errors' => true],
        ]);
        $body = @file_get_contents($url, false, $context);
    }

    if (!is_string($body) || $body === '') {
        return null;
    }
    $decoded = json_decode($body, true);

    return is_array($decoded) ? $decoded : null;
}

/**
 * The latest release as `['version' => string, 'published' => string|null]`, or null.
 *
 * A stale cache beats an empty slot: if GitHub is unreachable the last known good answer is used
 * rather than dropping the version from the page entirely.
 */
function latest_release(): ?array
{
    $fresh = read_release_cache(MUSTER_RELEASE_CACHE_TTL);
    if ($fresh !== null) {
        return $fresh;
    }

    $json = fetch_release_json();
    if ($json === null) {
        return read_release_cache();
    }

    $tag = is_string($json['tag_name'] ?? null) ? ltrim($json['tag_name'], 'v') : '';
    // Only ever print something that looks like a version.
    if ($tag === '' || preg_match('/^[0-9A-Za-z._-]{1,40}$/', $tag) !== 1) {
        return read_release_cache();
    }

    $published = null;
    if (is_string($json['published_at'] ?? null)) {
        $timestamp = strtotime($json['published_at']);
        if ($timestamp !== false) {
            $published = gmdate('j M Y', $timestamp);
        }
    }

    $release = ['version' => $tag, 'published' => $published];
    write_release_cache($release);

    return $release;
}
