'use strict';

var uuid = require('node-uuid'),
  EventEmitter = require('events').EventEmitter,
  url = require('url'),
  mime = require('mime-types'),
  baseDir = require('./directory'),
  fs = require('fs-extra'),
  path = require('path'),
  captureDir = path.join(baseDir, 'capture'),
  cleaning = false,
  MAXLENGTH = 1024;

if (fs.existsSync(captureDir)) {
  fs.removeSync(captureDir);
}

fs.mkdirSync(captureDir);

/*setInterval(function () {

  let now = Date.now();

  if (cleaning) {
    return;
  }

  cleaning = true;

  fs.walk(captureDir)
    .on('data', (item) => {
      if (item.stats.isDirectory()) {
        return;
      }
      let mtime = item.stats.mtime;
      if ((now - mtime.getTime()) > 3600 * 1000) {
        fs.unlink(item.path);
      }
    })
    .on('end', () => {
      cleaning = false;
    });

}, 60 * 1000);*/

class Report {

  constructor(id, url, req, reporter) {
    this._id = id;
    this._url = url;
    this._req = req;
    this._statusMessage = '';
    this._reporter = reporter;
    this._ts = Date.now();
    this._requestHeaders = req.headers;
    this._requestCaptureFile = path.join(baseDir, 'capture', this._id + '-req');
    this._responseCaptureFile = path.join(baseDir, 'capture', this._id + '-res');
    fs.writeFile(this._requestCaptureFile + '.json', JSON.stringify(req.headers));
  }

  logRequestChunk (chunk) {
    if (!this._requestCaptureStream) {
      this._requestCaptureStream =
        fs.createWriteStream(
          this._requestCaptureFile + '.bin',
          {
            flags : 'w',
            autoClose : true
          });
    }
    this._requestCaptureStream.write(chunk);
  }

  logResponseHeaders (headers) {
    this._responseHeaders = headers;
    fs.writeFile(this._responseCaptureFile + '.json', JSON.stringify(headers));
  }

  logResponseChunk (chunk) {
    if (!this._responseCaptureStream) {
      this._responseCaptureStream =
        fs.createWriteStream(
          this._responseCaptureFile + '.bin',
          {
            flags : 'w',
            autoClose : true
          });
    }
    this._responseCaptureStream.write(chunk);
  }

  logFinish() {
    if (this._responseCaptureStream) {
      this._responseCaptureStream.end();
    } else {
      this._responseCaptureFile = null;
    }
    this._latency = Date.now() - this._ts;
    this._reporter.emit('finish', this);
  }

  logStatus(code, message) {
    this._statusCode = code;
    this._statusMessage = message;
  }

  cleanup() {
    if (this._responseCaptureFile) {
      fs.unlink(this._responseCaptureFile + '.json');
      fs.unlink(this._responseCaptureFile + '.bin');
    }
    this._expired = true;
  }

  toJSON() {
    var token = url.parse(this._req.url);
    return {
      id: this._id,
      url: this._url,
      hostname: this._req.hostname || token.hostname,
      path: token.path,
      method: this._req.method,
      requestHeaders: this._requestHeaders,
      requestCapture : this._requestCaptureFile ? path.basename(this._requestCaptureFile) : null,
      responseHeaders: this._responseHeaders,
      responseCapture : this._responseCaptureFile ? path.basename(this._responseCaptureFile) : null,
      statusCode: this._statusCode,
      statusMessage: this._statusMessage,
      secure : this._req.connection.encrypted,
      latency: this._latency ? this._latency : null
    }
  }

}

class ConnectReport {

  constructor(id, hostname, port, reporter) {
    this._id = id;
    this._hostname = hostname;
    this._port = port;
    this._reporter = reporter;
    this._ts = Date.now();
  }

  logFinish() {
    this._latency = Date.now() - this._ts;
    this._status = 200;
    this._statusMesssage = 'OK';
    this._reporter.emit('finish', this);
  }

  logError() {
    this._latency = Date.now() - this._ts;
    this._status = 504;
    this._statusMesssage = 'Gateway Timeout';
    this._reporter.emit('finish', this);
  }

  cleanup() {
    this._expired = true;
  }

  toJSON() {
    return {
      id : this._id,
      url : 'CONNECT ' + this._hostname + ':' + this._port,
      hostname : this._hostname,
      path : '/',
      method : 'CONNECT',
      requestHeaders : {},
      responseHeaders : {},
      responseCapture : null,
      statusCode : this._status,
      statusMessage : this._statusMesssage || '',
      secure : false,
      latency : this._latency ? this._latency : null,
      expired : this._expired
    }
  }

}

class ProxyReporter extends EventEmitter {

  constructor() {
    super();
    this._reports = [];
  }

  create(url, req) {
    let report = new Report(uuid.v4(), url, req, this);
    this._reports.push(report);
    this.removeOldest();
    this.emit('create', report);
    return report;
  }

  createConnect(hostname, port) {
    let report = new ConnectReport(uuid.v4(), hostname, port, this);
    this._reports.push(report);
    this.removeOldest();
    this.emit('create', report);
    return report;
  }

  removeOldest() {
    while (this._reports.length > MAXLENGTH) {
      let removed = this._reports.shift();
      removed.cleanup();
      this.emit('expired', removed);
    }
  }

  getReports() {
    return this._reports;
  }

}

module.exports = ProxyReporter;