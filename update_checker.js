var fs = require('fs');
var path = require('path');


/**
 * @param {string} cacheFileName
 * @constructor
 */
var Checker = module.exports = function(cacheFileName) {
  /** @private {!Object<number>} */
  this._datesMap = {};
  /** @private {string} */
  this._fileName = cacheFileName;
};

/**
 * @param {!Array<string>} jsPaths
 * @return {!Array<string>}
 */
Checker.getJsFileNames = function(jsPaths, callback) {
  var jsFileNames = [];
  var pathsMap = {};

  jsPaths.forEach(function(jsPath) {
    jsPath = path.resolve(jsPath);

    jsFileNames = Checker._getFiles(jsPath).filter(function(jsPath) {
      if (/^.+\.js$/.test(jsPath) && !pathsMap[jsPath]) {
        pathsMap[jsPath] = 1;

        return true;
      }

      return false;
    }).concat(jsFileNames);
  });

  return jsFileNames;
};

/**
 * @param {string} file
 * @return {!Array.<string>}
 * @private
 */
Checker._getFiles = function(file) {
  var result = [];
  var stat = fs.statSync(file);

  if (stat && stat.isDirectory()) {
    var subFiles = fs.readdirSync(file);

    subFiles.forEach(function(subFile) {
      result = result.concat(Checker._getFiles(file + '/' + subFile));
    });
  } else {
    result.push(file);
  }

  return result;
};


/**
 * @param {function(Object<string>)} callback
 * @private
 */
Checker.prototype._getCacheData = function(callback) {
  var self = this;

  fs.exists(self._fileName, function(exists) {
    if (exists) {
      fs.readFile(self._fileName, 'utf8', function(err, content) {
        if (err) return callback(null);

        var json;
        var data = null;

        try {
          json = JSON.parse(content);
        } catch (e) { }

        if (json && 'object' == typeof json) {
          data = {};

          for (var sourceFileName in json) {
            if (
              'number' == typeof json[sourceFileName] &&
              0 < json[sourceFileName]
            ) {
              data[sourceFileName] = json[sourceFileName];
            }
          }
        }

        callback(data);
      });
    } else {
      callback(null);
    }
  });
};

/**
 * @param {string} path
 */
Checker.prototype.addFile = function(path) {
  if (fs.existsSync(path)) {
    this._datesMap[path] = +fs.statSync(path).mtime;
  }
};

/**
 * @param {string} path
 */
Checker.prototype.removeFile = function(path) {
  delete this._datesMap[path];
};

/**
 * @param {function(boolean)} callback
 */
Checker.prototype.check = function(callback) {
  var self = this;
  self._getCacheData(function(cacheDatesMap) {
    var updated = true;

    if (cacheDatesMap) {
      updated = false;

      for (var fileName in self._datesMap) {
        if (
          !cacheDatesMap[fileName] ||
          cacheDatesMap[fileName] != self._datesMap[fileName]
        ) {
          updated = true;
          break;
        }
      }
    }

    self._save(function(err) {
      callback(updated);
    });
  });
};

/**
 * @param {function(Error)=} opt_callback
 * @private
 */
Checker.prototype._save = function(opt_callback) {
  var json = {};

  for (var sourceFileName in this._datesMap) {
    json[sourceFileName] = this._datesMap[sourceFileName];
  }

  var callback = opt_callback || function() {};
  var fileName = this._fileName;

  require('mkdirp')(path.dirname(fileName), 0755, function(err) {
    if (err) {
      callback(err);
    } else {
      fs.writeFile(fileName, JSON.stringify(json), callback);
    }
  });
};
