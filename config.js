const config = {
    development: {
        port: 3000,
        gdeltApiUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
        searchQueries: [
            'digital credential',
            'open badge',
            'micro-credential'
        ],
        pageSize: 100,
        requestDelay: 2000
    },
    production: {
        port: process.env.PORT || 3000,
        gdeltApiUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
        searchQueries: [
            'digital credential',
            'open badge',
            'micro-credential'
        ],
        pageSize: 100,
        requestDelay: 2000
    }
};

const env = process.env.NODE_ENV || 'development';
module.exports = config[env]; 