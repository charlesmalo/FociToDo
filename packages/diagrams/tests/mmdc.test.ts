import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mmdcRenderer } from '../src/mmdc.js';
import { single } from './support/single.js';

/** The value following `flag` in an argument list. */
function argAfter(args: readonly string[], flag: string): string {
  const value = args[args.indexOf(flag) + 1];
  if (value === undefined) throw new Error(`no value after ${flag}`);
  return value;
}

const options = {
  mmdc: '/bin/mmdc',
  puppeteerConfig: '/puppeteer-config.json',
  mermaidConfig: '/tool/mermaid.config.json',
};

describe('mmdcRenderer', () => {
  it('runs mmdc on a temporary input and returns the SVG it wrote, then cleans up', async () => {
    const calls: { file: string; args: readonly string[]; input: string }[] = [];
    const render = mmdcRenderer({
      ...options,
      exec: async (file, args) => {
        calls.push({ file, args, input: readFileSync(argAfter(args, '-i'), 'utf8') });
        writeFileSync(argAfter(args, '-o'), '<svg>ok</svg>');
      },
    });
    await expect(render('\r\nflowchart LR\r\n  A-->B\r\n')).resolves.toBe('<svg>ok</svg>');
    const call = single(calls);
    expect(call.file).toBe('/bin/mmdc');
    expect(call.input).toBe('flowchart LR\n  A-->B\n');
    expect(call.args.slice(0, 7)).toEqual([
      '-p',
      '/puppeteer-config.json',
      '-c',
      '/tool/mermaid.config.json',
      '-b',
      'white',
      '-q',
    ]);
    expect(existsSync(argAfter(call.args, '-i'))).toBe(false);
  });

  it('propagates mmdc failures and still cleans up', async () => {
    let input = '';
    const render = mmdcRenderer({
      ...options,
      exec: async (_file, args) => {
        input = argAfter(args, '-i');
        throw new Error('Command failed: Parse error on line 2');
      },
    });
    await expect(render('flowchart LR\n  A--')).rejects.toThrow('Parse error on line 2');
    expect(existsSync(input)).toBe(false);
  });
});
