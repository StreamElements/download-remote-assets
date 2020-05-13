# download-remote-assets

Recursively scans a code folder, extracts remote asset URLs, and creates a mirror folder structure with the content of those URLs.

Part of OBS.Live build tools.

## Usage:

```sh
npm install

node app.js --source=<source-folder-path> --dest=<destination-folder-path> [--types=jpg,png,svg,mp4] [--concurrency=4]
```
