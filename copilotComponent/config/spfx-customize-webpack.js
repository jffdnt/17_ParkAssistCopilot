const fs = require('node:fs');
const path = require('node:path');

/**
 * Injects non-secret deployment coordinates into the browser bundle.
 *
 * Set PARKASSIST_CONFIG_FILE to a JSON file with name/resourceUri/baseUrl, or
 * override individual values with PARKASSIST_RESOURCE_URI and
 * PARKASSIST_BASE_URL. Relative config paths resolve from the SPFx project.
 */
module.exports = function customizeWebpack(config, taskSession, heftConfiguration, webpack) {
  const configuredPath = process.env.PARKASSIST_CONFIG_FILE || 'config/parkassist-environment.json';
  const configPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(heftConfiguration.buildFolderPath, configuredPath);
  const environment = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const resourceUri = process.env.PARKASSIST_RESOURCE_URI || environment.resourceUri;
  const baseUrl = String(process.env.PARKASSIST_BASE_URL || environment.baseUrl || '').replace(/\/$/, '');

  if (!/^api:\/\/[0-9a-f-]{36}$/i.test(resourceUri || '')) {
    throw new Error('PARKASSIST_RESOURCE_URI must be an api:// URI containing an Entra application ID.');
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error('PARKASSIST_BASE_URL must be an HTTPS origin.');
  }

  config.plugins.push(new webpack.DefinePlugin({
    __PARKASSIST_RESOURCE_URI__: JSON.stringify(resourceUri),
    __PARKASSIST_BASE_URL__: JSON.stringify(baseUrl)
  }));
  taskSession.logger.terminal.writeLine(
    `ParkAssist build environment: ${environment.name || 'custom'} (${baseUrl})`
  );
};
