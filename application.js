/**
 * @param {string} id
 * @param {!Object} config
 * @param {string} compilerPath
 */
var Application = module.exports = function(id, config, compilerPath) {

  /**
   * @private {!Array<function(Error,string?)>}
   */
  this._compileCallbacks = [];

  /**
   * @private {boolean}
   */
  this._compileAgain = false;

  /**
   * @private {string}
   */
  this._compilerPath = compilerPath;

  /**
   * @private {boolean}
   */
  this._compiled = false;

  /**
   * @private {boolean}
   */
  this._compiling = false;

  /**
   * @private {!Object}
   */
  this._config = config;

  /**
   * @private {Error}
   */
  this._error = null;

  /**
   * @type {string}
   */
  this.id = id;
};


/**
 * @param {string} appId
 * @return {string}
 */
Application.getAppDirName = function(appId) {
  return __dirname + '/cache/' + appId;
};


/**
 * @param {boolean=} opt_force
 * @param {function(Error)=} opt_callback
 */
Application.prototype.compile = function(opt_force, opt_callback) {
  if (this._compiled) {
    if (opt_force) {
      this._compiled = false;
      this._error = null;
      this.compile(false, opt_callback);
    } else if (opt_callback) {
      opt_callback(this._error);
    }
  } else {
    this._compileAgain = this._compileAgain || !!opt_force;

    if (opt_callback) {
      this._compileCallbacks.push(opt_callback);
    }

    if (!this._compiling) {
      this._compileAgain = false;
      this._compile();
    }
  }
};

/**
 * @private
 */
Application.prototype._compile = function() {
  var closurebuilder = require('closurebuilder');
  var mkdirp = require('mkdirp');
  var dirname = Application.getAppDirName(this.id);
  var self = this;
  var onComplete = function(err) {
    self._onCompileComplete(err);
  }

  mkdirp(dirname, 0755, function(err) {
    if (err) return onComplete(err);

    var compilerArgs = [];

    if (self._config.sourceMapLocationMapping) {
      for (var from in self._config.sourceMapLocationMapping) {
        compilerArgs.push('--source_map_location_mapping "' + from + '|/' +
          self.id + self._config.sourceMapLocationMapping[from] + '"');
      }
    }

    var compilerFlags = [];

    if (self._config.compilerFlags) {
      compilerFlags = compilerFlags.concat(self._config.compilerFlags);
    }

    var params = {
      cacheFile: dirname + '/deps.cache',
      compilerFlags: self._config.compilerFlags,
      defines: self._config.defines,
      externs: self._config.externs,
      jvmFlags: self._config.jvmFlags,
      maxBuffer: self._config.maxBuffer,
      compilerArgs: compilerArgs
    };

    if (self._config.modules) {
      params.sourceMapPath = dirname + '/module_';
      var modules = {};

      for (var key in self._config.modules) {
        modules[key] = self._config.modules[key];
      }

      modules.modules = {};

      for (var moduleKey in self._config.modules.modules) {
        modules.modules[moduleKey] = self._config.modules.modules[moduleKey];

        if (modules.modules[moduleKey].deps && modules.modules[moduleKey].deps.length) {
          modules.modules[moduleKey].wrapper =
            '%source%\n' +
            '//# sourceMappingURL=/' + self.id + '/' + moduleKey + '.map';
        } else {
          modules.modules[moduleKey].wrapper =
            'CLOSURE_NO_DEPS=true;\n' +
            'MODULE_INFO=%moduleInfo%;\n' +
            'MODULE_URIS=%moduleUris%;\n' +
            '%source%\n' +
            '//# sourceMappingURL=/' + self.id + '/' + moduleKey + '.map';
        }
      }

      modules.outputPath = dirname + '/module_';
      modules.productionUri = '/' + self.id + '/module_';

      closurebuilder.ModuleBuilder.compile(self._compilerPath, modules,
        self._config.files, params, onComplete);
    } else {
      params.compilerFlags.push(
        '--output_wrapper "CLOSURE_NO_DEPS=true;\n%output%\n//# sourceMappingURL=/' + self.id + '/index.map"');
      params.sourceMapPath = dirname + '/index.map';
      params.outputFile = dirname + '/index.js';
      closurebuilder.Builder.compile(self._compilerPath,
        self._config.inputFiles, self._config.files, params, onComplete);
    }
  });
};

/**
 * @param {Error} err
 * @private
 */
Application.prototype._onCompileComplete = function(err) {
  if (this._compileAgain) {
    this.compile();
  } else {
    this._error = err;
    this._compiled = true;

    var callbacks = this._compileCallbacks;
    this._compileCallbacks = [];

    callbacks.forEach(function(callback) {
      callback(err);
    });
  }
};
