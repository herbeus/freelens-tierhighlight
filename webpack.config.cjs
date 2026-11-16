/* eslint @typescript-eslint/no-var-requires: "off" */

const path = require("path");

// Freelens >= 2.0 loads extension entry points as ES modules (renderer via a
// dynamic import() of a served URL, main via a file: URL) and publishes its
// API plus the shared singletons on globalThis.FreelensExtensionApi.
const API = "globalThis.FreelensExtensionApi";

const common = {
  context: __dirname,
  mode: process.env.NODE_ENV ?? "production",
  devtool: process.env.NODE_ENV === "development" ? "cheap-module-source-map" : "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  experiments: {
    outputModule: true,
  },
};

module.exports = [
  {
    ...common,
    entry: "./src/main.ts",
    target: "node22",
    externals: {
      "@freelensapp/extensions": `var ${API}`,
      mobx: `var ${API}.Mobx`,
    },
    output: {
      library: { type: "module" },
      chunkFormat: "module",
      filename: "main.js",
      path: path.resolve(__dirname, "dist"),
    },
  },
  {
    ...common,
    entry: "./src/renderer.tsx",
    target: ["web", "es2022"],
    externals: {
      "@freelensapp/extensions": `var ${API}`,
      react: `var ${API}.React`,
      "react-dom": `var ${API}.ReactDom`,
      "react/jsx-runtime": `var ${API}.ReactJsxRuntime`,
      mobx: `var ${API}.Mobx`,
      "mobx-react": `var ${API}.MobxReact`,
    },
    output: {
      library: { type: "module" },
      chunkFormat: "module",
      filename: "renderer.js",
      path: path.resolve(__dirname, "dist"),
    },
  },
];
