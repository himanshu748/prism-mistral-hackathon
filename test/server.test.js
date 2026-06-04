import assert from 'node:assert/strict';
import test from 'node:test';

import {
    configuredPort,
    hasMistralKey,
    mistralModel,
    parseToolArguments,
    safeClientError,
    validateQuestion
} from '../server.js';

test('reads Mistral config dynamically from the environment', () => {
    const originalKey = process.env.MISTRAL_API_KEY;
    const originalModel = process.env.MISTRAL_MODEL;

    try {
        delete process.env.MISTRAL_API_KEY;
        delete process.env.MISTRAL_MODEL;
        assert.equal(hasMistralKey(), false);
        assert.equal(mistralModel(), 'mistral-small-latest');

        process.env.MISTRAL_API_KEY = '  test-key  ';
        process.env.MISTRAL_MODEL = '  mistral-large-latest  ';
        assert.equal(hasMistralKey(), true);
        assert.equal(mistralModel(), 'mistral-large-latest');
    } finally {
        restoreEnv('MISTRAL_API_KEY', originalKey);
        restoreEnv('MISTRAL_MODEL', originalModel);
    }
});

test('normalizes and bounds analysis questions', () => {
    assert.deepEqual(validateQuestion('  Should we pivot?  '), {
        ok: true,
        question: 'Should we pivot?'
    });

    assert.deepEqual(validateQuestion('   '), {
        ok: false,
        status: 400,
        error: 'Question is required'
    });

    assert.deepEqual(validateQuestion('x'.repeat(2001)), {
        ok: false,
        status: 413,
        error: 'Question must be 2000 characters or fewer.'
    });
});

test('keeps client-facing error messages safe', () => {
    assert.equal(
        safeClientError(new Error('MISTRAL_API_KEY is not configured on the server.')),
        'MISTRAL_API_KEY is not configured on the server.'
    );
    assert.equal(
        safeClientError(new Error('Mistral API error: HTTP 429')),
        'Mistral API error: HTTP 429'
    );
    assert.equal(
        safeClientError(new Error('stack trace with filesystem paths')),
        'Analysis failed. Check server logs for details.'
    );

    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    assert.equal(safeClientError(abortError), 'Mistral request timed out. Please try again.');
});

test('safely parses model tool-call arguments', () => {
    assert.deepEqual(parseToolArguments('{"query":"market","category":"news"}'), {
        query: 'market',
        category: 'news'
    });

    assert.deepEqual(parseToolArguments(''), {});
    assert.deepEqual(parseToolArguments('not json'), {});
    assert.deepEqual(parseToolArguments('["array", "is", "not", "args"]'), {});
});

test('falls back to a valid default port', () => {
    const originalPort = process.env.PORT;

    try {
        process.env.PORT = 'not-a-port';
        assert.equal(configuredPort(), 3000);

        process.env.PORT = '4242';
        assert.equal(configuredPort(), 4242);
    } finally {
        restoreEnv('PORT', originalPort);
    }
});

function restoreEnv(name, value) {
    if (value === undefined) {
        delete process.env[name];
        return;
    }

    process.env[name] = value;
}
