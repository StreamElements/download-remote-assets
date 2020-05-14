const fs = require('fs');
const fetch = require('node-fetch');
const commandLineArgs = require('command-line-args')
const PromisePool = require('es6-promise-pool');

function scanFile(urlsMap, src, urlRegEx) {
  const lines = fs.readFileSync(src, 'utf8').split(/\r|\n/).filter(i => i.length > 0);

  for (const line of lines) {
    const urls = line.toString().match(urlRegEx);

    if (!urls) continue;

    for (const url of urls) {
      urlsMap[url] = true;
    }
  }
}

function scanFolder(urlsMap, src, urlRegEx) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  const files = entries.filter(i => i.isFile()).map(i => i.name);
  const folders = entries.filter(i => i.isDirectory()).map(i => i.name).filter(i => ![ '.', '..' ].includes(i));

  for (const item of files) {
    scanFile(urlsMap, `${src}/${item}`, urlRegEx);
  }

  for (const item of folders) {
    scanFolder(urlsMap, `${src}/${item}`, urlRegEx);
  }
}

const argsDefinitions = [
  { name: 'source', alias: 's', type: String },
  { name: 'output', type: String, alias: 'o' },
  { name: 'types', type: String, alias: 't', defaultValue: 'jpg,png,svg,mp4,jpeg,webm' },
  { name: 'concurrency', type: Number, alias: 'c', defaultValue: 4 },
];

const args = commandLineArgs(argsDefinitions);

args.types = args.types.split(',').map(i => i.replace(/^\s*/, '').replace(/\s*$/, ''));

if (!args.source || !args.output || !args.types.length) {
  console.error(`Usage: ${process.argv[1]} --source=<source-folder-path> --dest=<destination-folder-path> [--types=jpg,png,svg,mp4,jpeg,webm] [--concurrency=4]`);

  process.exit(255);
}

const urlsMap = {};

const urlRegExPattern = `//([^/?#'":<>() ]+)/[^?#'"<>() ]+\\.(${args.types.join('|')})`;
const urlRegEx = new RegExp(urlRegExPattern, 'ig');

console.log('Scanning source folder tree...');
scanFolder(urlsMap, args.source, urlRegEx);

const urls = Object.keys(urlsMap);

let doneCounter = 0;
let errorCounter = 0;

function stats() {
  // console.log(`Done: ${doneCounter}; Errors: ${errorCounter}; Queue Length: ${urls.length}`);
}

function processNextUrl() {
  if (!urls.length) return null; // we're done

  const requestedUrl = urls.shift();

  const normalizedUrl = (requestedUrl.startsWith('//')) ? `http:${requestedUrl}` : requestedUrl;

  return fetch(normalizedUrl).then(res => {
    if (!res.ok) {
      ++errorCounter;

      stats();

      if (res.status === 404) {
        return Promise.resolve();
      } else {
        return Promise.reject(new Error(`${normalizedUrl}: ${res.status} ${res.statusText}`));
      }
    }

    return res.buffer().then(buffer => {
      const url = new URL(normalizedUrl);

      const fileName = url.pathname.split('/').pop();
      const folderPath = url.pathname.substr(1, url.pathname.lastIndexOf('/') - 1);

      const fullFolderPath = `${args.output}/${url.hostname}/${folderPath}`;
      const fullFilePath = `${fullFolderPath}/${fileName}`;

      fs.mkdirSync(fullFolderPath, { recursive: true });
      fs.writeFileSync(fullFilePath, buffer);
      
      ++doneCounter;

      stats();

      console.log('Mirrored URL: ', normalizedUrl);

      return Promise.resolve();
    });
  }).catch(err => {
    console.error('Error fetching URL: ', normalizedUrl, err);

    const url = new URL(normalizedUrl);

    if (url.hostname.includes('streamelements.com')) {
      // Don't allow skipping errors on .streamelements.com domain
      
      process.exit(255);
      //throw err;
    }

    ++errorCounter;

    stats();
  });
}

console.log(`Fetching ${urls.length} URLs...`);
const pool = new PromisePool(processNextUrl, args.concurrency);

//pool.start();
