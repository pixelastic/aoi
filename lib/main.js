const Nodemw = require('nodemw');
const Page = require('./page.js');
const path = require('path');
const _ = require('golgoth/_');
const pify = require('golgoth/pify');
const pMap = require('golgoth/pMap');
const exists = require('firost/exists');
const firostError = require('firost/error');
const writeJson = require('firost/writeJson');
const read = require('firost/read');
const write = require('firost/write');
const readJson = require('firost/readJson');

module.exports = {
  nodemw: null,
  cacheLocation: null,
  init(userOptions) {
    const options = {
      cacheLocation: path.resolve('./tmp/cache'),
      ...userOptions,
    };
    this.cacheLocation = options.cacheLocation;
    const nodemwOptions = {
      path: options.path,
      port: options.port,
      server: options.server,
    };
    this.nodemw = new Nodemw(nodemwOptions);
  },
  /**
   * Convert a page title to its url
   * @param {string} title Page title
   * @returns {string} Page slug
   **/
  slug(title) {
    return _.chain(title).replace(/ /g, '_').replace(/'/g, '%27').value();
  },
  /**
   * Query the API and return a custom Page instance
   * @param {string} pageName Name of the page
   * @returns {object} Custom Page object
   **/
  async page(pageName) {
    // Read raw content from cache
    const cachePath = path.resolve(this.cacheLocation, pageName);

    if (await exists(cachePath)) {
      const raw = await read(cachePath);
      return new Page(pageName, raw);
    }

    const getArticle = pify(this.nodemw.getArticle.bind(this.nodemw));
    const raw = await getArticle(pageName);
    await write(raw, cachePath);
    return new Page(pageName, raw);
  },
  async category(categoryName) {
    let pageNames = null;

    // Read from cache
    const cachePath = path.resolve(
      this.cacheLocation,
      `Category:${categoryName}.json`
    );
    if (await exists(cachePath)) {
      pageNames = await readJson(cachePath);
    } else {
      const getPagesInCategory = pify(
        this.nodemw.getPagesInCategory.bind(this.nodemw)
      );

      try {
        const raw = await getPagesInCategory(categoryName);
        pageNames = _.map(raw, 'title');
        await writeJson(pageNames, cachePath);
      } catch (err) {
        console.error(err);
        throw firostError(
          'ERROR_PAGES_IN_CATEGORY',
          `Can't get all pages in the category ${categoryName}. Check that the name is correct and the API is open.`
        );
      }
    }

    const allPages = await pMap(pageNames, async (pageName) => {
      return {
        pageName,
        pageData: await this.page(pageName),
      };
    });

    return _.transform(
      allPages,
      (result, value) => {
        result[value.pageName] = value.pageData;
      },
      {}
    );
  },
};
