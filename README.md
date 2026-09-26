# Instagram Non-Followers

**Find the accounts you follow that don't follow you back.**

A small JavaScript utility that runs in your browser console. No installation, API key or third-party account required.

### What you get

- A sorted list of accounts that don't follow you back.
- Separate console output for verified and non-verified accounts.
- A CSV download and a list of usernames copied to your clipboard, both including verified accounts.

It compares your current follower and following lists. It **doesn't unfollow anyone** and **doesn't track who unfollowed you over time**.

## Quick start

1. Open [Instagram](https://www.instagram.com/) in desktop Chrome and sign in to your account.
2. Open [`unfollowers.js`](unfollowers.js), select **Raw**, and copy the entire script. Read it before running it: console scripts execute inside your signed-in session.
3. On the Instagram tab, open **Developer Tools → Console**.
4. Paste the script and press **Enter**. Keep the tab open while it collects both lists; larger accounts can take several minutes.
5. Read the console results and open the downloaded **`non_ti_seguono.csv`**.

If the browser blocks pasting, stop and review its warning. Do not disable browser security settings to run this script.

Console messages are currently in Italian. If clipboard access is unavailable, the script prints a manual copy command. To stop a running scan, reload the Instagram tab.

## How it works

```text
Accounts you follow − Accounts following you = Non-followers
```

The script reads your account ID from Instagram's session cookie, fetches both lists with pagination, and compares account IDs. Requests go directly from your browser to Instagram; the script has no external server or analytics. The result stays in the console, clipboard and downloaded file.

## Limits

- Uses Instagram's internal web endpoints, which can change without notice. This is an unofficial utility, not an Instagram or Meta product.
- Requests are spaced out and rate-limit retries are bounded. Instagram may still restrict requests or require another login. If that happens, stop and try later; don't repeatedly launch the script.
- Stops on detected incomplete pagination, repeated cursors or unexpected responses, instead of exporting a partial comparison. There is a limit of **300 pages per list**.
- Results depend on the lists Instagram returns. Changes while scanning or omissions by the service can affect accuracy; this is not a guaranteed snapshot.
- Only use it with your own account. Exported files contain profile information: keep them private.

## Development

The script has no runtime dependencies. To run the offline regression tests, use Node.js 22 or newer:

```sh
node --check unfollowers.js
node --test tests/unfollowers.test.cjs
```

Tests simulate the browser and Instagram responses. They cover pagination, malformed responses, rate limits, domain checks and CSV escaping; they **do not establish live compatibility with Instagram**.

## License

[MIT](LICENSE) · Built by [Davide](https://davide.sh)
