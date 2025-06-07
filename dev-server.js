const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

// 개발 환경 설정
const config = {
    port: 3000,
    // gdeltApiUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
    newsApiUrl: 'https://newsapi.org/v2/everything',
    searchQueries: [
        '"digital credential" OR "digital credentials"',
        '"open badge" OR "open badges"',
        '"micro-credential" OR "micro-credentials"',
        '"digital certification" OR "digital certifications"',
        '"blockchain credential" OR "blockchain credentials"'
    ],
    pageSize: 100,
    requestDelay: 2000
};

// 유틸리티 함수
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// News API 관련 함수들
const newsApi = {
    async fetchArticles(query) {
        const url = `${config.newsApiUrl}?q=${encodeURIComponent(query)}&pageSize=${config.pageSize}&language=en&sortBy=relevancy`;
        console.log('Fetching news from News API:', url);

        try {
            await delay(config.requestDelay);
            const response = await axios.get(url, {
                headers: {
                    'X-Api-Key': process.env.NEWS_API_KEY,
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (!response.data?.articles) {
                console.warn(`Invalid response for query "${query}":`, response.data);
                return [];
            }

            return response.data.articles;
        } catch (error) {
            console.error(`News API Error for query "${query}":`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message
            });
            return [];
        }
    },

    transformArticle(article) {
        return {
            title: article.title || '',
            description: article.description || '',
            url: article.url || '',
            urlToImage: article.urlToImage || '',
            publishedAt: article.publishedAt || '',
            source: {
                name: article.source?.name || 'Unknown'
            }
        };
    },

    isValidArticle(article) {
        return !!article.url;
    }
};

/* GDELT API 관련 함수들 - 일시적으로 주석 처리
const gdeltApi = {
    async fetchArticles(query) {
        const url = `${config.gdeltApiUrl}?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=${config.pageSize}`;
        console.log('Fetching news from GDELT:', url);

        try {
            await delay(config.requestDelay);
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (!response.data?.articles) {
                console.warn(`Invalid response for query "${query}":`, response.data);
                return [];
            }

            return response.data.articles;
        } catch (error) {
            console.error(`GDELT API Error for query "${query}":`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message
            });
            return [];
        }
    },

    transformArticle(article) {
        return {
            title: article.title || '',
            description: article.seo_description || article.description || '',
            url: article.url || '',
            urlToImage: article.image || '',
            publishedAt: article.seo_date_published || article.date_published || '',
            source: {
                name: article.domain || 'Unknown'
            }
        };
    },

    isValidArticle(article) {
        return !!article.url;
    }
};
*/

// 뉴스 처리 관련 함수들
const newsProcessor = {
    async fetchAllNews() {
        let allArticles = [];

        for (const query of config.searchQueries) {
            // News API에서 뉴스 가져오기
            const newsApiArticles = await newsApi.fetchArticles(query);
            console.log(`News API articles count for "${query}": ${newsApiArticles.length}`);

            const validNewsApiArticles = newsApiArticles
                .map(newsApi.transformArticle)
                .filter(newsApi.isValidArticle);

            /* GDELT API 사용 일시 중단
            // GDELT API에서 뉴스 가져오기
            const gdeltArticles = await gdeltApi.fetchArticles(query);
            console.log(`GDELT articles count for "${query}": ${gdeltArticles.length}`);

            const validGdeltArticles = gdeltArticles
                .map(gdeltApi.transformArticle)
                .filter(gdeltApi.isValidArticle);
            */

            allArticles = [...allArticles, ...validNewsApiArticles];
        }

        return allArticles;
    },

    removeDuplicates(articles) {
        return Array.from(new Map(articles.map(article => [article.url, article])).values());
    },

    sortByDate(articles) {
        return articles.sort((a, b) => {
            const dateA = new Date(a.publishedAt || 0);
            const dateB = new Date(b.publishedAt || 0);
            return dateB - dateA;
        });
    }
};

// Express 앱 설정
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 로깅 미들웨어
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// 라우트 핸들러
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/news', async (req, res) => {
    try {
        const allArticles = await newsProcessor.fetchAllNews();
        console.log(`Total articles before deduplication: ${allArticles.length}`);

        if (allArticles.length === 0) {
            throw new Error('No articles found from any query');
        }

        const uniqueArticles = newsProcessor.removeDuplicates(allArticles);
        console.log(`Total articles after deduplication: ${uniqueArticles.length}`);

        const sortedArticles = newsProcessor.sortByDate(uniqueArticles);
        res.json({ articles: sortedArticles });
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: error.message });
    }
});

// 서버 시작
app.listen(config.port, () => {
    console.log(`Development server is running on port ${config.port}`);
    console.log('Using News API:', !!process.env.NEWS_API_KEY);
}); 