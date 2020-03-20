const { getOptionsFromArgs, toString, getCurrentTimestamp, mkdir, readJsonFile, writeFile, capitalize, logger } = require('./utils');
const { fork } = require('child_process');
const { convertJsonEntitiesToJDL, convertToJDL } = require('jhipster-core');

const RELATIONSHIP_TYPES = {
    "1:1": "one-to-one",
    "1:n": "one-to-many",
    "n:1": "many-to-one",
    "n:n": "many-to-many"
}

const RELATIONSHIP = "relationship";
const FIELD = "field";
const USER_ENTITY_NAME = 'User';
const RESERVED_KEYWORDS = [USER_ENTITY_NAME];

class SwaggerJsonProcessor {

    constructor(jsonFile) {
        logger.info(`Creating Json swagger processor`)
        this.jsonFile = jsonFile;
        this.skippedUserManagement = false;
    }

    parseSwaggerFile() {
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
        logger.info(`Parsing swagger definition to jdl entities`);

        if (!this.parsedSwagger.definitions || this.parsedSwagger.definitions.length === 0) {
            //todo handle empty definitions array
        }

        const entities = new Map();

        Object.keys(this.parsedSwagger.definitions).forEach(key => {

            // skip entity if it contains key word
            if(RESERVED_KEYWORDS.includes(key)) {
                logger.error(`Entity name cannot contain reserved keyword [ ${key} ]. Skipping`)
                return;
            }

            let defaultJsonEntity = this.getDefaultJsonEntity(key);

            this.parseSingleSwaggerDefinition(key).forEach(object => {
                if (object.type === FIELD) {
                    defaultJsonEntity.fields.push(object.value);
                } else if (object.type === RELATIONSHIP && object.value !== null) {
                    defaultJsonEntity.relationships.push(object.value);
                }
            });

            entities.set(defaultJsonEntity.name, defaultJsonEntity);

            this.skippedUserManagement = defaultJsonEntity.name === USER_ENTITY_NAME;
        })

        this.jdlEntities = convertJsonEntitiesToJDL({
            entities: entities,
            skippedUserManagement: entities.has(USER_ENTITY_NAME)
        });

        this.persistEntitiesToJson(entities);

        logger.info(`Completed parsing Swagger model definitions to JDL Entities`);
    }

    parseSingleSwaggerDefinition(key) {

        let entityDefinition = this.parsedSwagger.definitions[key];
        let entityProperties = entityDefinition.properties;

        if (!entityProperties || entityProperties.length === 0) {
            // todo handle empty properties array
        }

        let objects = [];

        Object.keys(entityProperties).forEach(propertyName => {
            let object = this.parseSwaggerPropertyToEntityFieldAndRelationship(entityProperties, propertyName, key);
            if (Object.keys(object).length !== 0) {
                objects.push(object);
            }
        })

        return objects;
    }

    parseSwaggerPropertyToEntityFieldAndRelationship(entityProperties, propertyName, currentEntityName) {
        let entityProperty = entityProperties[propertyName];

        let returnObj = {};

        // if it contains $ref or items key then it is a definition of a relationship
        if (RELATIONSHIP in entityProperty) {
            returnObj.type = RELATIONSHIP;
            returnObj.value = this.handleRelationship(entityProperty, propertyName, currentEntityName);
        } else if (!["object", "array"].includes(entityProperty.type)) {
            // handle basic property
            let defaultField = this.getDefaultField(propertyName);

            if ("enum" in entityProperty) {
                defaultField.fieldValues = entityProperty.enum.map((enumName) => enumName.toUpperCase()).join(",");
                defaultField.fieldType = capitalize(propertyName);
            } else {
                defaultField.fieldType = this.getFieldType(entityProperty.type);
            }

            returnObj.type = FIELD;
            returnObj.value = defaultField;
        } else {
            logger.error(`Could not create an object for entity property ${currentEntityName}.${propertyName}[${toString(entityProperty)}] as its type is currently unsupported`);
        }

        return returnObj;
    }

    handleRelationship(entityProperty, propertyName, currentEntityName) {
        try {
            let defaultRelationship = this.getDefaultRelationship(currentEntityName, propertyName);
            let relatingEntity = this.getRelatingEntity(entityProperty);

            let relationshipDetails = entityProperty.relationship;

            defaultRelationship.relationshipType = this.getRelationshipType(relationshipDetails.type);
            defaultRelationship.otherEntityName = defaultRelationship.relationshipName = relatingEntity;
            defaultRelationship.otherEntityField = entityProperty.joiningAttribute;
            return defaultRelationship;
        } catch (e) {
            logger.error(`Could not define a relationship object for ${propertyName}. Failed with error: ${e.message}`);
            return null;
        }
    }

    getDefaultJsonEntity(name) {
        return {
            "name": capitalize(name), // convert to uppercase
            "fields": [],
            "relationships": [],
            "changelogDate": getCurrentTimestamp(),
            "entityTableName": name.toLowerCase(),
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

    getDefaultRelationship(currentEntityName, otherEntityName) {
        return {
            "relationshipType": "",
            "otherEntityName": otherEntityName.toLowerCase(),
            "otherEntityRelationshipName": currentEntityName.toLowerCase(),
            "relationshipName": "",
            "otherEntityField": ""
        }
    }

    persistEntitiesToJson(entities) {

        try {
            mkdir(".jhipster");

            entities.forEach((entity, entityName) => {
                writeFile(JSON.stringify(entity), `.jhipster/${entityName}.json`)
            })
        } catch (e) {
            logger.error(`An error occurred while trying to persist the entity JSONs to a file: ${e.message}`, e)
        }
    }

    getRelatingEntity(entityProperty) {
        let ref;

        if ("$ref" in entityProperty) {
            ref = entityProperty["$ref"];
        } else if ("items" in entityProperty && "$ref" in entityProperty.items) {
            ref = entityProperty.items["$ref"];
        } else {
            throw `Cannot find a reference to a relating entity in property Entity ${toString(entityProperty)}`;
        }

        return (ref.substr(ref.lastIndexOf('/') + 1)).toLowerCase();
    }

    getFieldType(type) {
        switch (type) {
            case "integer":
                return "Integer";
            case "string":
            default:
                return "String";
        }
    }

    getRelationshipType(relationship) {
        let relation = RELATIONSHIP_TYPES[relationship];

        if (!relation) {
            logger.error(`The relationship type ${relationship} is undefined`);
        }

        return relation;
    }
}

class ConfigJsonProcessor {
    constructor(configJson) {
        this.configJson = configJson;
        this.yoRcJson = {};
    }

    parseConfigJsonToJdlApplicationConfig() {
        let configs = readJsonFile(this.configJson);
        
        this.yoRcJson["generator-jhipster"] = configs;
        writeFile(JSON.stringify(this.yoRcJson), ".yo-rc.json");
        logger.info(`done`);
    }
}

module.exports = (args, options, env, forkProcess = fork) => {
    logger.debug('cmd: parse-swagger from ./parse-swagger');
    logger.debug(`args: ${toString(args)}`);

    let swaggerFile = [];
    if (!options.inline) {
        swaggerFile = getOptionsFromArgs(args);
    }

    if (swaggerFile.length !== 2) {
        logger.fatal("Command usage: jhipster parse-swagger <full path to swagger json> <full path to config json>")
    }

    try {
        const swaggerProcessor = new SwaggerJsonProcessor(swaggerFile[0]);
        swaggerProcessor.parseSwaggerFile();

        const configJsonProcessor = new ConfigJsonProcessor(swaggerFile[1]);
        configJsonProcessor.parseConfigJsonToJdlApplicationConfig();

        convertToJDL(".", "app.jh");

        require(`./import-jdl`)(["app.jh"], options, env); //call import-jdl
    } catch (e) {
        logger.error(`Error during importing and parsing the swagger json: ${e.message}`, e)
    }
}