// dev-server-gdelt.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const config = {
  port: process.env.PORT || 3001,
  gdeltApiUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
  searchQueries: [
    '(blockchain credential OR blockchain credentials)',
    '(open badge OR open badges)',
    '("micro-credential" OR "micro-credentials")',
    '(digital certification OR digital certifications)',
    '(blockchain certification OR blockchain certifications)'
  ],
  pageSize: 50,  // 메모리 관리를 위해 크기 조정
  requestDelay: 1000,  // 성능 개선을 위해 딜레이 감소
  maxRetries: 3,  // 재시도 횟수
  retryDelay: 2000  // 재시도 간 딜레이
};

const delay = ms => new Promise(r => setTimeout(r, ms));

const gdeltApi = {
  async fetchArticles(query, retryCount = 0) {
    const url = `${config.gdeltApiUrl}` +
      `?query=${encodeURIComponent(query)}` +
      `&mode=artlist` +
      `&format=json` +
      `&maxrecords=${config.pageSize}` +
      `&lang=eng` +
      `&domain=news`;
    
    console.log(`[${new Date().toISOString()}] Fetching news from GDELT:`, url);

    try {
      await delay(config.requestDelay);
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      // 응답 구조 로깅
      console.log('GDELT API Response structure:', {
        isArray: Array.isArray(data),
        hasItems: data?.items ? 'yes' : 'no',
        hasDocuments: data?.documents ? 'yes' : 'no',
        keys: Object.keys(data || {})
      });

      // 응답 데이터 구조 확인
      if (!data) {
        console.warn('Empty response from GDELT API');
        return [];
      }

      // articles 배열이 있는지 확인
      if (data.articles && Array.isArray(data.articles)) {
        console.log(`Found ${data.articles.length} articles in articles array`);
        return data.articles;
      }

      // items 배열이 있는지 확인
      if (data.items && Array.isArray(data.items)) {
        console.log(`Found ${data.items.length} articles in items array`);
        return data.items;
      }

      // documents 배열이 있는지 확인
      if (data.documents && Array.isArray(data.documents)) {
        console.log(`Found ${data.documents.length} articles in documents array`);
        return data.documents;
      }

      // 배열 자체인 경우
      if (Array.isArray(data)) {
        console.log(`Found ${data.length} articles in root array`);
        return data;
      }

      console.warn('Unexpected GDELT response structure:', JSON.stringify(data, null, 2));
      return [];
    } catch (error) {
      console.error(`GDELT API Error for "${query}":`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      // 재시도 로직
      if (retryCount < config.maxRetries) {
        console.log(`Retrying... (${retryCount + 1}/${config.maxRetries})`);
        await delay(config.retryDelay);
        return this.fetchArticles(query, retryCount + 1);
      }

      return [];
    }
  },

  transformArticle(article) {
    try {
      if (!article) {
        console.warn('Empty article received');
        return null;
      }

      // 날짜 처리 개선
      let rawDate = article.date_published || article.seendate || article.publishedAt || '';
      let publishedAt = '';
      
      if (rawDate) {
        // 다양한 날짜 형식 처리
        if (rawDate.match(/^\d{8}T\d{6}Z$/)) {
          publishedAt = rawDate.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
            '$1-$2-$3T$4:$5:$6Z'
          );
        } else if (rawDate.match(/^\d{4}-\d{2}-\d{2}/)) {
          publishedAt = rawDate;
        } else {
          console.warn('Unexpected date format:', rawDate);
        }
      }

      // 필수 필드 확인
      if (!article.title || !article.url) {
        console.warn('Article missing required fields:', {
          hasTitle: !!article.title,
          hasUrl: !!article.url
        });
        return null;
      }

      // 설명 필드 처리 개선
      const description = article.content || 
                         article.summary || 
                         article.description || 
                         article.snippet || 
                         article.title;  // 설명이 없으면 제목 사용

      return {
        title: article.title,
        description: description,
        url: article.url,
        urlToImage: article.socialimage || article.image || article.urlToImage || '',
        publishedAt,
        source: { 
          name: article.domain || article.source?.name || 'Unknown',
          country: article.sourcecountry || article.source?.country || ''
        },
        language: article.language || '',
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
      if (!article) {
        console.warn('Empty article in validation');
        return false;
      }

      // 필수 필드 검증
      const hasRequiredFields = 
        article.title &&
        article.url &&
        article.url.startsWith('http');

      // 언어 검증
      const isEnglish = 
        article.language === 'English' ||
        article.language === 'eng' ||
        article.url.includes('.com') ||
        article.url.includes('.org') ||
        article.url.includes('.net');

      // 내용 검증 - 설명이 없으면 제목을 설명으로 사용
      const hasValidContent = 
        (article.description && article.description.length > 0) ||
        (article.title && article.title.length > 0);

      const isValid = hasRequiredFields && isEnglish && hasValidContent;

      if (!isValid) {
        console.log('Invalid article:', {
          hasRequiredFields,
          isEnglish,
          hasValidContent,
          url: article.url,
          language: article.language,
          title: article.title?.substring(0, 50),
          description: article.description?.substring(0, 50)
        });
      }

      return isValid;
    } catch (error) {
      console.error('Error validating article:', error);
      return false;
    }
  }
};

const newsProcessor = {
  async fetchAllNews() {
    let all = [];
    for (const q of config.searchQueries) {
      console.log(`\nProcessing query: "${q}"`);
      const raw = await gdeltApi.fetchArticles(q);
      console.log(`  Raw count: ${raw.length}`);
      
      const good = raw
        .map(gdeltApi.transformArticle)
        .filter(a => a && gdeltApi.isValidArticle(a));
      
      console.log(`  Valid count: ${good.length}`);
      all = all.concat(good);
    }
    console.log(`\nTotal collected: ${all.length}`);
    return all;
  },

  removeDuplicates(arr) {
    const seen = new Set();
    return arr.filter(article => {
      const url = article.url.toLowerCase();
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  },

  sortByDate(arr) {
    return arr.sort((a, b) => {
      const dateA = new Date(a.publishedAt || 0);
      const dateB = new Date(b.publishedAt || 0);
      return dateB - dateA;
    });
  }
};

const app = express();
app.use(cors());
app.use(express.json());

// 루트 디렉토리에서 index.html 및 정적 파일 서빙
app.use(express.static(__dirname));

// API 소스 정보 엔드포인트
app.get('/api/source', (req, res) => {
  res.json({ source: 'GDELT' });
});

// 뉴스 API
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

// 루트 index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
});
