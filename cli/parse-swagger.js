const { getOptionsFromArgs, toString, getCurrentTimestamp, readJsonFile, logger } = require('./utils');
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
            // this.parsedSwagger = await SwaggerParser.validate(this.jsonFile);
            this.parsedSwagger = readJsonFile(this.jsonFile);
            this.application = this.parsedSwagger.info.title.replace(/\s+/g, "");
            logger.info(`Successfully parsed received swagger file having title: ${toString(this.application)}`);

            this.parseSwaggerDefinitionsToJDLEntities();

        } catch (e) {
            logger.error(`Failed parsing swagger file at ${this.jsonFile} with err ${e.message}`, e);
        }
    }

    parseSwaggerDefinitionsToJDLEntities() {
        logger.info(`parsing swagger def to jdl entities`);

        return;

        if (!this.parsedSwagger.definitions || this.parsedSwagger.definitions.length === 0) {
            //todo handle empty definitions array
        }

        Object.keys(this.parsedSwagger).forEach(key => {
            this.parseSingleSwaggerDefinition(key);
        })
    }

    parseSingleSwaggerDefinition(key) {
        if (definition.type !== 'object') {
            return;
        }

        let defaultJsonEntity = this.getDefaultJsonEntity(key);

        let entityDefinition = this.parsedSwagger.definitions[key];
        let entityProperties = entityDefinition.properties;

        if (!entityProperties || entityProperties.length === 0) {
            // todo handle empty properties array
        }

        Object.keys(entityProperties).forEach(propertyName => {
            this.parseSwaggerPropertyToEntityFieldAndRelationship(entityProperties, propertyName);
        })
    }

    parseSwaggerPropertyToEntityFieldAndRelationship(entityProperties, propertyName) {
        let entityProperty = entityProperties[propertyName];

        let returnObj = {};

        if ("$ref" in entityProperty || "items" in entityProperty) {
            handleRelationship(entityProperty, propertyName);
        } else {
            // handle basic property
            let defaultField = this.getDefaultField(propertyName);
            returnObj.type = 'field';
            returnObj.value = defaultField;
        }

        return returnObj;
    }

    getDefaultJsonEntity(name) {
        return {
            "name": name.charAt(0).toUpperCase() + name.slice(1), // convert to uppercase
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

    getDefaultField(name) {
        return {
            "fieldName": name,
            "fieldType": "",
            "fieldValidateRules": []
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

        // require(`./import-jdl`)(["app.jh"], options, env); call import-jdl
    } catch (e) {
        logger.error(`Error during importing and parsing the swagger json: ${e.message}`, e)
    }
}