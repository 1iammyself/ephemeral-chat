# Contributing to Ephemeral Chat

Thank you for your interest in contributing to Ephemeral Chat! We appreciate your time and effort. This guide will help you get started with contributing to the project.

## 📋 Table of Contents
- [Code of Conduct](#-code-of-conduct)
- [How Can I Contribute?](#-how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
- [Development Setup](#-development-setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [Pull Request Process](#-pull-request-process)
- [Coding Standards](#-coding-standards)
- [License](#-license)

## 🌟 Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## 🤝 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/cLLeB/ephemeral-chat/issues) to see if the problem has already been reported.

When creating a bug report, please include:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs. actual behavior
- Screenshots if applicable
- Browser/OS version
- Any error messages

### Suggesting Enhancements

We welcome enhancement suggestions that improve the project. When suggesting an enhancement:
- Describe the feature in detail
- Explain why you believe this would be valuable
- Include any relevant screenshots or mockups
- Note if you'd be willing to work on this feature

### Your First Code Contribution

Unsure where to begin? Look for issues labeled "good first issue" or "help wanted" in the [issues section](https://github.com/cLLeB/ephemeral-chat/issues).

## 🛠 Development Setup

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher) or yarn
- Git
- (Optional) Redis for local development

### Installation

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/ephemeral-chat.git
   cd ephemeral-chat
   ```
3. Install dependencies:
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

### Running the Application

1. Start the development server:
   ```bash
   # From the project root
   npm run dev
   ```
2. The application will be available at `http://localhost:3000`
3. The server will be running on `http://localhost:3001`

## 🔄 Pull Request Process

1. Fork the repository and create your branch from `main`
2. Make your changes
3. Ensure the test suite passes
4. Run linters: `npm run lint`
5. Format your code: `npm run format`
6. Add tests if applicable
7. Update documentation as needed
8. Submit a pull request with a clear description of changes

## 📝 Coding Standards

- Follow existing code style and formatting
- Write clear, concise commit messages
- Include comments for complex logic
- Keep pull requests focused on a single feature/bug
- Update documentation when changing features

## 📄 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to Ephemeral Chat! Your help is greatly appreciated.
