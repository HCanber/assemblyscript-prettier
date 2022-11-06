// We need this in an ordinary js file to get access to require
// and we also need to use require in order for it to be available
require("../package.json");

if (!require.resolve) {
  require.resolve = (request, options) => {
    return Module._resolveFilename(request, options);
  };
}
