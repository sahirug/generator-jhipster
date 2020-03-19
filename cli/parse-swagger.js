const { getOptionsFromArgs, toString, getCurrentTimestamp, logger } = require('./utils');
const { fork } = require('child_process');
const SwaggerParser = require('@apidevtools/swagger-parser');
const jhiCore = require('jhipster-core');

class JsonSwaggerProcessor {
    constructor(jsonFile) {
        logger.info(`Creating Json swagger processor`)
        this.jsonFile = jsonFile;
    }

    async parseSwaggerFile() {
        try {
            this.parsedSwagger = await SwaggerParser.validate(this.jsonFile);
            this.application = this.parsedSwagger.info.title.replace(/\s+/g, "");
            logger.info(`Successfully parsed received swagger file having title: ${toString(this.application)}`);

            this.parseSwaggerDefinitionsToJDLEntities();

        } catch (e) {
            logger.error(`Failed parsing swagger file at ${this.jsonFile} with err ${e.message}`, e);
        }
    }

    parseSwaggerDefinitionsToJDLEntities() {
        logger.info(`parsing swagger def to jdl entities`);

        if(!this.parsedSwagger.definitions || this.parsedSwagger.definitions.length === 0) {
            //todo handle empty definitions array
        }

        Object.keys(this.parsedSwagger).forEach(key => {
            this.parseSingleSwaggerDefinition(this.parsedSwagger.definitions[key]);
        })
    }

    parseSingleSwaggerDefinition(definition) {
        if(definition.type !== 'object') {
            return;
        }
    }

    getDefaultJsonEntity(name) {
        return {
            "name": name.charAt(0).toUpperCase() + name.slice(1),
            "fields": [],
            "relationships": [],
            "changeLlogDate": getCurrentTimestamp(),
            "entityTableName": name,
            "dto": "no",
            "pagination": "infinite-scroll", // default
            "service": "serviceImpl",
            "jpaMetamodelFiltering": false,
            "fluentMethods": false,
            "readOnly": false,
            "embedded": false,
            "clientRootFolder": "",
            "applications": [this.application]
        }
    }
}

module.exports = (args, options, env, forkProcess = fork) => {
    logger.debug('cmd: parse-swagger from ./parse-swagger');
    logger.debug(`args: ${toString(args)}`);

    let swaggerFile = [];
    if (!options.inline) {
        swaggerFile = getOptionsFromArgs(args);
    }

    if (swaggerFile.length !== 1) {
        logger.fatal("Only 1 swagger JSON can be parsed at a time")
    }

    try {
        const swaggerProcessor = new JsonSwaggerProcessor(swaggerFile[0]);
        swaggerProcessor.parseSwaggerFile();
    } catch (e) {
        logger.error(`Error during importing and parsing the swagger json: ${e.message}`, e)
    }
}