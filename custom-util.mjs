import util from 'node:util';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(event, params = {}) {
      super(event, params);
      this.detail = params.detail;
    }
  };
}


export const {
  _extend,
  callbackify,
  debuglog,
  deprecate,
  format,
  formatWithOptions,
  getSystemErrorMap,
  getSystemErrorName,
  inherits,
  inspect,
  isBoolean,
  isBuffer,
  isCharacterObject,
  isDate,
  isDateObject,
  isError,
  isFunction,
  isNull,
  isNullOrUndefined,
  isNumber,
  isObject,
  isPrimitive,
  isRegExp,
  isRegExpObject,
  isString,
  isSymbol,
  isUndefined,
  promisify,
  stripVTControlCharacters,
  toUSVString,
  transfer,
  types
} = util;

export function styleText(format, text) {
  return text;
}

export function parseEnv(content) {
  const result = {};
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return result;
}

export default {
  ...util,
  styleText,
  parseEnv
};
