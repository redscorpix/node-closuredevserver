var optimist = require('optimist').
  alias('c', 'config').
  describe('c', 'JSON config').
  alias('f', 'file').
  describe('f', 'JSON config file').
  alias('h', 'help').
  boolean('h').
  describe('h', 'This message');
var argv = optimist.argv;

if (argv.f) {
  require('fs').readFile(argv.f, 'utf8', function(err, data) {
    if (err) {
      throw err;
    }

    var config = JSON.parse(data);
    require('./main')(config);
  });
} else if (argv.c) {
  require('./main')(argv.c);
} else {
  optimist.showHelp();
}


