// dev-server-gdelt.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

// 설정
const config = {
  port: process.env.PORT || 3001,
  gdeltApiUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
  searchQueries: {
    english: [
      '(open badge OR open badges)',
      '("micro-credential" OR "micro-credentials")',
      '(digital certification OR digital certifications)'
    ]    
  },
  pageSize: 50,
  requestDelay: 1000,
  maxRetries: 3,
  retryDelay: 2000
};

// 유틸리티 함수
const utils = {
  delay: ms => new Promise(r => setTimeout(r, ms)),
  
  isKorean: text => /[가-힣]/.test(text || ''),
  
  formatDate: (rawDate) => {
    if (!rawDate) return '';
    if (rawDate.match(/^\d{8}T\d{6}Z$/)) {
      return rawDate.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
        '$1-$2-$3T$4:$5:$6Z'
      );
    }
    if (rawDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      return rawDate;
    }
    console.warn('Unexpected date format:', rawDate);
    return '';
  }
};

// GDELT API 클라이언트
const gdeltApi = {
  async fetchArticles(query, language = 'eng') {
    const url = `${config.gdeltApiUrl}` +
      `?query=${encodeURIComponent(query)}` +
      `&mode=artlist` +
      `&format=json` +
      `&maxrecords=${config.pageSize}` +
      `&lang=${language}` +
      `&domain=news` +
      `&sort=relevancedesc` +
      (language === 'kor' ? '&country=South Korea' : '');
    
    console.log(`[${new Date().toISOString()}] Fetching ${language} news:`, url);

    try {
      await utils.delay(config.requestDelay);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      // 응답이 문자열인 경우 JSON으로 파싱 시도
      let data = response.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
          console.log('Successfully parsed JSON response');
        } catch (parseError) {
          console.error('Failed to parse JSON response:', parseError);
          console.log('Raw response:', data.substring(0, 200) + '...');
          return [];
        }
      }

      if (!data) {
        console.warn('Empty response from GDELT API');
        return [];
      }

      // 응답 구조 확인 및 로깅
      const articles = this.extractArticles(data);
      console.log(`Found ${articles.length} articles for query "${query}"`);
      return articles;
    } catch (error) {
      console.error(`GDELT API Error:`, {
        query,
        language,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) + '...' : undefined
      });
      return [];
    }
  },

  extractArticles(data) {
    // 배열이면서 숫자 문자열 키를 가진 경우 처리
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
      console.log('Converting array response to articles...');
      return data.map((_, index) => {
        const article = data[index];
        if (typeof article === 'object' && article !== null) {
          return article;
        }
        return null;
      }).filter(Boolean);
    }

    // 기존 응답 구조 처리
    if (Array.isArray(data)) return data;
    if (data.articles && Array.isArray(data.articles)) return data.articles;
    if (data.items && Array.isArray(data.items)) return data.items;
    if (data.documents && Array.isArray(data.documents)) return data.documents;

    // 응답 구조 로깅
    console.log('Response structure:', {
      isArray: Array.isArray(data),
      type: typeof data,
      keys: Object.keys(data || {}),
      firstItem: data ? data[0] : null
    });

    return [];
  },

  transformArticle(article) {
    try {
      if (!article?.title || !article?.url) {
        console.warn('Invalid article:', { 
          hasTitle: !!article?.title, 
          hasUrl: !!article?.url 
        });
        return null;
      }

      const description = article.content || 
                         article.summary || 
                         article.description || 
                         article.snippet || 
                         article.title;

      const isKorean = utils.isKorean(article.title) || 
                      utils.isKorean(description) ||
                      article.language === 'Korean' ||
                      article.language === 'kor' ||
                      article.url.includes('.kr');

      return {
        title: article.title,
        description,
        url: article.url,
        urlToImage: article.socialimage || article.image || article.urlToImage || '',
        publishedAt: utils.formatDate(article.date_published || article.seendate || article.publishedAt),
        source: { 
          name: article.domain || article.source?.name || 'Unknown',
          country: article.sourcecountry || article.source?.country || ''
        },
        language: isKorean ? 'Korean' : (article.language || 'English'),
        seo_title: article.seo_title || article.title,
        seo_image: article.seo_image || article.socialimage || article.image || ''
      };
    } catch (error) {
      console.error('Error transforming article:', error);
      return null;
    }
  },

  isValidArticle(article) {
    try {
      if (!article?.title || !article?.url?.startsWith('http')) {
        return false;
      }

      const isKorean = utils.isKorean(article.title) || 
                      utils.isKorean(article.description) ||
                      article.language === 'Korean' ||
                      article.language === 'kor' ||
                      article.url.includes('.kr');

      const isEnglish = 
        article.language === 'English' ||
        article.language === 'eng' ||
        article.url.includes('.com') ||
        article.url.includes('.org') ||
        article.url.includes('.net');

      const hasContent = 
        (article.description && article.description.length > 0) ||
        (article.title && article.title.length > 0);

      return (isKorean || isEnglish) && hasContent;
    } catch (error) {
      console.error('Error validating article:', error);
      return false;
    }
  }
};

// 뉴스 처리기
const newsProcessor = {
  async fetchAllNews() {
    let allArticles = [];
    
    // 영어 뉴스 수집 (english 배열이 있는 경우에만)
    if (config.searchQueries.english && Array.isArray(config.searchQueries.english)) {
      for (const query of config.searchQueries.english) {
        const articles = await this.fetchNewsForQuery(query, 'eng');
        allArticles = allArticles.concat(articles);
      }
    }
    
    // 한국어 뉴스 수집
    if (config.searchQueries.korean && Array.isArray(config.searchQueries.korean)) {
      for (const query of config.searchQueries.korean) {
        const articles = await this.fetchNewsForQuery(query, 'kor');
        allArticles = allArticles.concat(articles);
      }
    }

    console.log(`Total articles collected: ${allArticles.length}`);
    return allArticles;
  },

  async fetchNewsForQuery(query, language) {
    console.log(`\nProcessing ${language} query: "${query}"`);
    const raw = await gdeltApi.fetchArticles(query, language);
    console.log(`  Raw count: ${raw.length}`);
    
    const valid = raw
      .map(gdeltApi.transformArticle)
      .filter(article => article && gdeltApi.isValidArticle(article));
    
    console.log(`  Valid count: ${valid.length}`);
    return valid;
  },

  removeDuplicates(articles) {
    const seen = new Set();
    return articles.filter(article => {
      const url = article.url.toLowerCase();
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
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
app.use(express.static(__dirname));

// API 엔드포인트
app.get('/api/source', (req, res) => {
  res.json({ source: 'GDELT' });
});

app.get('/api/news', async (req, res) => {
  try {
    let articles = await newsProcessor.fetchAllNews();
    
    if (!articles.length) {
      console.log('No articles found');
      return res.json({ articles: [] });
    }

    articles = newsProcessor.removeDuplicates(articles);
    console.log(`After deduplication: ${articles.length} articles`);

    articles = newsProcessor.sortByDate(articles);
    console.log(`After sorting: ${articles.length} articles`);

    res.json({ articles });
  } catch (err) {
    console.error('Error in /api/news:', err);
    res.status(500).json({ 
      error: 'Error fetching news',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 루트 경로
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 서버 시작
app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
});
