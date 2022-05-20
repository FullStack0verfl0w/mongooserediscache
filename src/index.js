const redis = require('redis');
const util = require('util');

module.exports = function (mongoose, redisClient) {
    // create reference for .exec
    const exec = mongoose.Query.prototype.exec;
    const client = redis.createClient(redisClient || "redis://127.0.0.1:6379");

    // create new cache function on prototype
    mongoose.Query.prototype.cache = function (options) {
        this.useCache = true;
        if (options) {
            this.expire = options.expire;
        } else {
            this.expire = 60;
        }
        this.hashKey = JSON.stringify(options?.key || this.mongooseCollection.name);

        return this;
    }

    // override exec function to first check cache for data
    mongoose.Query.prototype.exec = async function () {
        if (!this.useCache) {
            return await exec.apply(this, arguments);
        }

        const key = JSON.stringify({
            ...this.getQuery(),
            collection: this.mongooseCollection.name
        });

        // get cached value from redis
        const cached = await client.get(key);

        // if cache value is not found, fetch data from mongodb and cache it
        if (!cached) {
            const result = await exec.apply(this, arguments);
            client.set(key, JSON.stringify(result));
            client.expire(key, this.expire);

            return result;
        }

        // return found cachedValue
        const doc = JSON.parse(cached);

        return Array.isArray(doc)
            ? doc.map(d => new this.model(d))
            : new this.model(doc);
    };
};