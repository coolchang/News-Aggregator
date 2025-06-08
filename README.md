# News Aggregator

A news aggregation service that collects and displays news articles from GDELT API, focusing on digital credentials, blockchain, and related topics.

## Features

- Real-time news collection from GDELT API
- Support for both English and Korean news articles
- Relevance-based article sorting
- Deduplication of articles
- Date-based sorting
- RESTful API endpoints

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/news-aggregator.git
cd news-aggregator
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add your configuration:
```env
PORT=3001
NODE_ENV=development
```

## Usage

Start the development server:
```bash
npm run dev:gdelt
```

The server will start at `http://localhost:3001`

## API Endpoints

- `GET /api/news`: Get all news articles
- `GET /api/source`: Get API source information

## Project Structure

- `dev-server-gdelt.js`: Main server file
- `index.html`: Frontend interface
- `package.json`: Project dependencies and scripts

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 