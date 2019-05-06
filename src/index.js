
const { spawn } = require('child_process');
const express = require('express');
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');

const yaml = require('yaml');
const { BadRequest, NotFound, Unauthorized } = require('http-errors');
const bodyParser = require('body-parser');

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
    console.warn('Missing signature header');
    throw new BadRequest('Missing signature header');
  }

  const sig = crypto.createHmac('sha1', conf.secret).update(buf).digest('hex');

  if (req.get('X-Hub-Signature') !== `sha1=${sig}`) {
    console.warn('Invalid signature', req.get('X-Hub-Signature'), 'expected: ', sig);
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

  console.log(`Starting task ${taskId} on ${new Date()}`);

  task.stdout.on('data', (data) => {
    console.log(format(taskId, 'stdout', data));
  });

  task.stderr.on('data', (data) => {
    console.log(format(taskId, 'stderr', data));
  });

  task.on('close', (code) => {
    console.log(`Task ${taskId}: child process exited with code ${code}`);
  });
}

app.post('/github-hook/:repoId', bodyParser.json({ verify }), (req, res, next) => {
  const body = req.body;
  const conf = req.conf;

  const { repoId } = req.params;
  const commit = body.head_commit;
  const repository = body.repository;

  if (req.get('x-github-event') !== 'push')
    return res.send('osef');

  console.log(`Received hook for repository: "${repository.full_name} (repoId=${repoId})", commit "${commit.message}" done by "${commit.author.username}" (commit id=${commit.id})`);

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
  console.log(`github-hook listening on port ${PORT}!`);
});
