const { execSync } = require('child_process');
const argv = require('yargs').argv;

// Get the value of NUM_ITERATIONS from command line arguments
const traceNumber = argv.TRACE_NUM || '0';

// Construct the Jest command with the provided number of iterations
const jestCommand = `NO_WAIT_CHANNEL1=1 NO_WAIT_HTTP2=1 NO_WAIT_CHANNEL2=1 NO_WAIT_DELAY=1 jest -b src/testcases/run_in_band/tge.quint`;

// Execute the Jest command
execSync(jestCommand, {
  stdio: 'inherit',
  env: {
    ...process.env,
    TRACE_NUM: traceNumber // Pass NUM_ITERATIONS as an environment variable
  }
});