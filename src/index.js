
const { spawn } = require('child_process');
const express = require('express');
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');

const { BadRequest, NotFound, Unauthorized } = require('http-errors');
const bodyParser = require('body-parser');
const log = require('loglevel');
const yaml = require('yaml');

log.setLevel('debug');

const { PORT, CONFIG } = process.env;

const config = yaml.parse(fs.readFileSync(CONFIG, 'utf8'));

const app = express();

const version = require('../package').version;

for (const conf in config.repositories) {
  const repo = config.repositories[conf];
  assert(repo.secret, `Missing secret for "${conf}" repository`);
  assert(repo.script, `Missing script for "${conf}" repository`);
}

function verify(req, res, buf, encoding) {
  const { repoId } = req.params;
  const conf = config.repositories[repoId];

  if (!conf) {
    throw new NotFound('Repository not found');
  }

  if (!req.get('X-Hub-Signature')) {
    log.warn('Missing signature header');
    throw new BadRequest('Missing signature header');
  }

  const sig = crypto.createHmac('sha1', conf.secret).update(buf).digest('hex');

  if (req.get('X-Hub-Signature') !== `sha1=${sig}`) {
    log.warn('Invalid signature', req.get('X-Hub-Signature'), 'expected: ', sig);
    throw new Unauthorized('Invalid signature header');
  }

  req.conf = conf;
}

function format(id, output, data) {
  return data
    .toString()
    .split('\n')
    .filter(e => !!e.trim())
    .map(str => `  ${id}:${output}: ${str}`)
    .join('\n');
}

function exec(script) {
  const taskId = Math.random().toString(16).slice(-8);
  const task = spawn('sh', script.split(' ').filter(e => !!e.trim()));

  log.info(`Starting task ${taskId} on ${new Date()}`);

  task.stdout.on('data', (data) => {
    log.info(format(taskId, 'stdout', data));
  });

  task.stderr.on('data', (data) => {
    log.info(format(taskId, 'stderr', data));
  });

  task.on('close', (code) => {
    log.info(`Task ${taskId}: child process exited with code ${code}`);
  });
}

app.post('/github-hook/:repoId', bodyParser.json({ verify }), (req, res, next) => {
  const body = req.body || {};
  const conf = req.conf;

  const { repoId } = req.params;
  const commit = body.head_commit;
  const { repository, refs } = body;

  if (req.get('x-github-event') !== 'push') {
    res.send('osef');
    return;
  }

  log.info(`Received hook for repository: "${repository.full_name} (repoId=${repoId})", commit "${commit.message}" done by "${commit.author.username}" (commit id=${commit.id})`);

  // Filter if branch specified
  if (conf.branch) {
    const [, branch] = /.*heads\/(.+)$/.exec(refs) || [];
    if (!branch) {
      log.warn('Cannot detect branch, the script will continue anyway.');
    }

    log.debug(`Branch "${branch}" detected`);

    if (branch !== conf.branch) {
      return;
    }
  }

  exec(conf.script);

  res.send('ok');
});

app.get('/github-hook/version', (req, res, next) => res.send(version));

app.get('*', (req, res, next) => { throw new NotFound });

app.use((error, req, res, next) => {
  const code = error.status || 500;
  res.status(code).json({ code, error: error.message });
});

app.listen(PORT, () => {
  log.info(`github-hook listening on port ${PORT}!`);
});
