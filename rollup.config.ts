import ts from "rollup-plugin-ts";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";

const plugins = () => [
	resolve(
	),
	json(),
	ts({
		tsconfig: "tsconfig.build.json"
	}),
	commonjs({
		include: "**/node_modules/**"
	})
];

const configs = [
	{
		input: "src/cli.ts",
		output: [
			{
				format: "cjs",
				file: "dist/cli.js"
			}
		],
		plugins: [
			...plugins()
		],
		treeshake: false
	}
];

export default configs;