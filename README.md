# Github hook server

## Install

Copy / fork source somwhere (for example in `/opt/github-hook`).

Create '/etc/systemd/system/github-hook.service'
```
[Unit]
Description=Github Webook Server
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/github-hook/src/index.js
# Required on some systems
#WorkingDirectory=/opt/nodeserver
Restart=always
# Restart service after 10 seconds if node service crashes
RestartSec=10
# Output to syslog
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=github-hook
#User=<alternate user>
#Group=<alternate group>
Environment=NODE_ENV=production PORT=8080 CONFIG=/home/me/my-config.yml

[Install]
WantedBy=multi-user.target
```

## Start
```
systemctl start github-hook
```

## Example of config file

```yml
repositories:
  project1:
    secret: project1secret
    script: /some/path/script.sh
  project2:
    secret: project2secret
    script: /another/path/script.sh --some-argument
  project3:
    secret: project1secret
    script: /some/path/script.sh
    branch: master # optional
```

# Configure your github project: 

> Note that this is an example for the "project1" repository.

Go into your project's settings > webhooks

Set `Payload URL` to `http://example.com:8080/github-hook/project1`

Set `Content type` to `application/json`

Set `Secret` to `project1secret`
