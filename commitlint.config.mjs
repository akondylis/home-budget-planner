export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test']
        ],
        'type-empty': [2, 'never'],
        'type-case': [2, 'always', 'lower-case'],
        'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
        'subject-empty': [2, 'never'],
        'footer-max-line-length': [2, 'always', 200],
        'footer-leading-blank': [2, 'never'],
        'body-max-line-length': [2, 'always', 150]
    }
}
