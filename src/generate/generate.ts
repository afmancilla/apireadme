import { green, red, yellow } from "colors";
import { read } from "fs-extra";
import { resolve } from "path";
import { defaultConfig, defaultConfigName, defaultGenerators, extendConfigWithDefaults, extendConfigWithExtendConfig } from "../config";
import { checkLinksAliveness, extractValues, fileExists, isFunction, loadConfig, loadPackage, readFile, replaceInString, validateObject, writeFile } from "../helpers";
import { IConfig, IGenerator, IGeneratorParamsArgs, IGeneratorParamsError, Options, Params } from "../model";
import { simpleTemplateGenerator } from "./generators";

/**
 * Generates a readme.
 * @param pkg
 * @param blueprint
 * @param configPath
 * @param generators
 */
export async function generateReadme ({config, blueprint, configPath, generators}: {config: IConfig, blueprint: string, configPath: string, generators: IGenerator<any>[]}): Promise<string> {

	const {silent} = config;

	// Go through all of the generators and replace with the template
	let defaultArgs = {config, configPath, generateReadme};

	for (const generator of generators) {
		const regex = generator.regex({...defaultArgs, blueprint});
		let match: RegExpMatchArray | null = null;

		do {
			match = regex.exec(blueprint);
			if (match != null) {
				let markdown = match[0];
				let errorReason;
				let params: any | null | Params | IGeneratorParamsError = null;

				// If the params are required we extract them from the package.
				if (generator.params != null) {
					if (isFunction(generator.params)) {

						// Extract the params using the function
						params = (<(args: IGeneratorParamsArgs) => any>generator.params)({
							...defaultArgs,
							blueprint,
							match
						});

						// Validate the params
						if (params == null || params.error) {
							errorReason = (params || {}).error || `the params couldn't not be generated`;
						}

					} else {

						// Get the required and optional parameters
						const optionalParams = (<any>generator.params)["optional"] || [];
						const requiredParams = {...generator.params};
						//delete requiredParams["optional"];

						// Validate the params
						if (!validateObject({obj: config, requiredFields: (<any>Object).values(requiredParams)})) {
							errorReason = `"${configPath}" is missing one or more of the keys "${(<any>Object).values(requiredParams)
							                                                                                  .join(", ")}"`;
						} else {
							params = extractValues({map: {...optionalParams, ...requiredParams}, obj: config});
						}
					}
				}

				// Use the template if no errors occurred
				if (errorReason == null) {
					markdown = await generator.template({...defaultArgs, blueprint, ...params});

				} else {
					if (!silent) {
						console.log(yellow(`[readme] - The readme generator "${generator.name}" matched "${match[0]}" but was skipped because ${errorReason}.`));
					}
				}

				// Replace the match with the new markdown
				const start = match.index!;
				const end = start + match[0].length;
				blueprint = replaceInString(blueprint, markdown, {start, end});

				// Change the regex pointer so we dont parse the newly added content again
				regex.lastIndex = start + markdown.length;
			}
		} while (match != null);
	}

	return blueprint;
}

/**
 * Generates the readme.
 */
export async function generate ({config, configPath, generators}: {config: IConfig, configPath: string, generators: IGenerator<any>[]}) {

	const {dry, silent, templates, output} = config;

	// Grab blueprint
	let blueprint: string = "";
	if (Array.isArray(config.input)) {
		blueprint = config.input.join(config.lineBreak);

	} else {
		const blueprintPath = resolve(config.input);
		if (!fileExists(blueprintPath)) {
			console.log(red(`[readme] - Could not find the blueprint file "${blueprintPath}". Make sure to provide a valid path as either the user arguments --readme.input or in the "input" field in the "${configPath}" file.`));
			return;
		}

		blueprint = readFile(blueprintPath) || "";
	}

	// Grab templates
	if (templates != null) {
		const simpleTemplateGenerators = templates.map(simpleTemplateGenerator);

		// Append the simple generators after the loading generator
		generators.splice(1, 0, ...simpleTemplateGenerators);
	}

	// Generate the readme
	let readme = await generateReadme({config, blueprint, configPath, generators});

	// Add warning
	const warning = `<!-- ⚠️ This README has been generated from the file(s) "${Array.isArray(config.input) ? config.input.join(", ") : config.input}" ⚠️-->`;
	readme = `${warning}${readme}`;

	// Check broken links
	if (config.checkLinks) {
		await checkLinksAliveness(readme);
	}

	// Write the file
	if (!dry) {
		try {
			await writeFile({target: output, content: readme});

			// Print the success messsage if not silent
			if (!silent) {
				console.log(green(`[readme] - A readme file was successfully generated at "${output}".`));
			}
		} catch (err) {
			console.log(red(`[readme] - Could not generate readme at "${output}"`), err);
		}

	} else {
		console.log(green(`[readme] - Created the following readme but did not write it to any files".`), green(readme));
	}
}

/**
 * Runs the readme command.
 * @param options
 */
export async function generateCommand (options: Options) {
	const configPath = resolve(options["config"] || options["c"] || defaultConfigName);

	let config: IConfig = loadConfig(configPath) || defaultConfig;
	config = extendConfigWithExtendConfig({config});
	config = extendConfigWithDefaults({config, options});

	// Extend the config with the package object
	config.pkg = {...(loadPackage(config.package) || {}), ...config.pkg};
	await generate({config, configPath, generators: defaultGenerators});
}