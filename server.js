var optimist = require('optimist').
  alias('c', 'config').
  describe('c', 'JSON config').
  alias('f', 'file').
  describe('f', 'JSON config file').
  alias('h', 'help').
  boolean('h').
  describe('h', 'This message');
var argv = optimist.argv;
var applications = {};

if (argv.f) {
  require('fs').readFile(argv.f, 'utf8', function(err, data) {
    if (err) {
      throw err;
    }

    var config = JSON.parse(data);
    runConfig(config);
  });
} else if (argv.c) {
  runConfig(argv.c);
} else {
  optimist.showHelp();
}

/**
 * @param {!Object} config
 */
function runConfig(config) {
  var err = parseConfig(config);

  if (err) {
    throw err;
  }

  var Application = require('./application');

  for (var id in config.applications) {
    applications[id] =
      new Application(id, config.applications[id], config.compilerPath);
  }

  runServer(config);
}

var appIdSymbols = '[A-Za-z0-9_]+';
var appIdRegExp = new RegExp('^' + appIdSymbols + '$');

/**
 * @param {!Object} config
 * @return {Error}
 */
function parseConfig(config) {
  var errMessage;

  if (!config.applications) {
    errMessage = 'Empty application list';
  }

  for (var id in config.applications) {
    if (!appIdRegExp.test(id)) {
      errMessage = 'Application ID ' + id + ' is incorrect';
    }
  }

  if (!errMessage) {
    if (!config.compilerPath) {
      errMessage = 'Empty compiler path';
    }
  }

  return errMessage ? new Error('Config error: ' + errMessage) : null;
}

/**
 * @param {!Object} config
 */
function runServer(config) {
  var ip = config.ip || '0.0.0.0';
  var port = config.port || 3000;
  var app = require('express')();
  app.set('env', config.env);
  app.enable('case sensitive routing');
  app.use(require('morgan')('tiny'));
  app.use(require('body-parser').urlencoded({
    extended: true
  }));

  app.use(function(req, res, next) {
    var appId;
    var moduleId = null;
    var isMap = false;

    if ('get' == req.method.toLowerCase()) {
      for (var id in config.applications) {
        if ('/' + id + '/index.js' == req.url) {
          appId = id;
          break;
        } else if ('/' + id + '/index.map' == req.url) {
          isMap = true;
          appId = id;
          break;
        } else {
          var isSource = false;

          if (config.applications[id].sourceMapLocationMapping) {
            for (var mapKey in config.applications[id].sourceMapLocationMapping) {
              var prefix = '/' + id + config.applications[id].sourceMapLocationMapping[mapKey];

              if (!req.url.indexOf(prefix)) {
                isSource = true;
                var fileName = mapKey + req.url.substr(prefix.length);

                var fs = require('fs');
                fs.exists(fileName, function(exists) {
                  if (exists) {
                    fs.readFile(fileName, 'utf8', function(err, data) {
                      if (err) return next(err);

                      res.set('Content-Type', 'application/javascript');
                      res.send(data);
                    });
                  } else {
                    next(new Error('File not found'));
                  }
                });

                return;
              }
            }
          }

          if (!isSource) {
            var regExp = new RegExp(
              '^/' + id + '/(' + appIdSymbols + ')\.js$');
            var match = regExp.exec(req.url);

            if (match) {
              appId = id;
              moduleId = match[1];
              break;
            } else {
              regExp = new RegExp('^/' + id + '/(' + appIdSymbols + ')\.map$');
              match = regExp.exec(req.url);

              if (match) {
                isMap = true;
                appId = id;
                moduleId = match[1];
                break;
              }
            }
          }
        }
      }
    }

    if (appId) {
      var compile = function(force) {
        applications[appId].compile(force, function(err) {
          if (err) return next(err);

          var dirname = require('./application').getAppDirName(appId);
          var fileName;

          if (isMap) {
            fileName = dirname + '/' +
              (moduleId ? 'module_' + moduleId : 'index') + '.map';
          } else {
            fileName = dirname + '/' +
              (moduleId ? 'module_' + moduleId : 'index') + '.js';
          }

          var fs = require('fs');
          fs.exists(fileName, function(exists) {
            if (exists) {
              fs.readFile(fileName, 'utf8', function(err, data) {
                if (err) return next(err);

                res.set('Content-Type',
                  isMap ? 'application/json' : 'application/javascript');
                res.send(data);
              });
            } else {
              next(new Error('File not found'));
            }
          });
        });
      };

      var Checker = require('./update_checker');
      var jsFileNames = config.applications[appId].files ?
        Checker.getJsFileNames(config.applications[appId].files) : null;

      if (jsFileNames) {
        var checker = new Checker(__dirname + '/cache/' + appId +
          '/update_dates.cache');

        jsFileNames.forEach(function(jsFileName) {
          checker.addFile(jsFileName);
        });

        checker.check(function(force) {
          compile(force);
        });
      } else {
        compile(false);
      }
    } else {
      next();
    }
  });
  app.use(require('errorhandler')());
  require('http').createServer.call(this, app).
    listen(config.port, config.ip, function() {
      console.log('Dev Server listening on ' + config.ip + ':' + config.port);
    });
}
