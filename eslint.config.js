import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message:
                'lucide-react는 이 프로젝트에서 금지입니다. 아이콘은 @phosphor-icons/react를 사용하세요.',
            },
            {
              name: '@phosphor-icons/react',
              importNames: ['Sparkle', 'MagicWand'],
              message:
                'Sparkle / MagicWand 류(반짝이·요술봉) 아이콘은 사용 금지입니다. 의미가 분명한 다른 아이콘을 쓰세요.',
            },
          ],
          patterns: [
            {
              group: ['lucide-react', 'lucide-react/*'],
              message:
                'lucide-react는 금지입니다. @phosphor-icons/react를 사용하세요.',
            },
          ],
        },
      ],
    },
  },
])
