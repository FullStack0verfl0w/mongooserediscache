const EXPIRE_TIME = 60;

module.exports = function (mongoose, client) {
    // create reference for .exec
    const exec = mongoose.Query.prototype.exec;

    // create new cache function on prototype
    mongoose.Query.prototype.cache = function (options) {
        this.useCache = true;
        this.expire = options?.expire || EXPIRE_TIME;

        return this;
    }

    // override exec function to first check cache for data
    mongoose.Query.prototype.exec = async function () {
        const expire = this.expire;

        if ( !this.useCache ) {
            return await exec.apply(this, arguments);
        }

        const key = JSON.stringify({
            ...this.getQuery(),
            collection: this.mongooseCollection.name,
            op: this.op,
            options: this.options,
        });

        // get cached value from redis
        const cached = await client.get(key);

        // if cache value is not found, fetch data from mongodb and cache it
        if ( !cached ) {
            const result = await exec.apply(this, arguments);
            client.set(key, JSON.stringify(result));
            client.expire(key, expire);

            return result;
        }

        const doc = JSON.parse(cached);

        return Array.isArray(doc)
            ? doc.map(d => new this.model(d))
            : new this.model(doc);
    };
};