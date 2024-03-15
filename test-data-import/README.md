# Steps to run

To run this example, you need Typescript and Node.

## Install Typescript

If `ts` is not installed, install it:

```bash
npm install -g typescript
```

## Install node modules

```bash
yarn
```

## Compile TS to JS

```bash
tsc test.ts
```

## Run JS

```bash
node test.js
```

Initial data for this example is stored in `init_data.json` file:

```json
[
  {
    "address" : "test1",
    "amount" : "1000000"
  },
  {
    "address" : "test2",
    "amount" : "1000000"
  }
]
```

Example loads data for key `test1`.

Output should look like:

```bash
1000000
```
