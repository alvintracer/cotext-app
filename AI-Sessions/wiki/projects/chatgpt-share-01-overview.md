---
type: project
date: 2026-06-13
status: active
source: README.md, START_HERE.md, TEMPLATE_MANIFEST.md
---

# ChatGPT Share Pack 01 - Overview

## Summary

이 문서는 `AI-Agent-Wiki-Template`의 목적, 운영 철학, 핵심 진입점을 ChatGPT가 빠르게 이해하도록 압축한 개요다.

이 템플릿은 개인 메모장이 아니라, 여러 AI 에이전트와 사람이 같은 업무 맥락을 공유하는 Obsidian 기반 업무 위키를 빠르게 세팅하기 위한 빈 vault다.

## Context

- 템플릿 이름: `AI-Agent-Wiki-Template`
- 버전: `1.0.0`
- 배포 형태: 더미 데이터 없는 템플릿
- 주요 대상 에이전트: Claude Code, Codex, 기타 파일 기반 AI 에이전트

## Details

### 템플릿의 목표

1. 실제 업무 자료를 `raw`와 `wiki`로 분리해 저장한다.
2. 에이전트가 저장, 조회, 점검을 반복 가능한 프로세스로 수행하게 만든다.
3. 다음 세션이나 다른 에이전트가 바로 이어받을 수 있는 인수인계형 vault를 만든다.

### 템플릿에 포함된 것

- Obsidian vault 기본 구조
- 에이전트 규칙 파일 `CLAUDE.md`, `AGENTS.md`
- 첫 실행용 가이드 `START_HERE.md`
- 전체 지도 `index.md`
- 작업 로그 `log.md`
- 반복 작업용 프롬프트 모음 `prompts/`
- 템플릿 유효성 검사 스크립트 `scripts/validate-template.sh`

### 템플릿에 포함되지 않는 것

- 예시 고객 정보
- 예시 프로젝트 자료
- 예시 회의록
- 개인 메모
- API 키, 토큰, 비밀번호

### 빠른 시작 흐름

1. Obsidian에서 폴더를 vault로 연다.
2. Claude Code 또는 Codex를 같은 폴더에서 실행한다.
3. `START_HERE.md`의 첫 실행 프롬프트를 붙여넣는다.
4. 에이전트가 구조를 점검하고 사용자 업무에 맞게 vault를 보강한다.

### ChatGPT가 이 템플릿을 이해할 때 알아야 할 핵심

- 이 저장소는 일부 콘텐츠를 담은 위키가 아니라, 운영 규칙이 포함된 빈 업무 위키 템플릿이다.
- 실제 지식은 앞으로 `AI-Sessions/raw/`와 `AI-Sessions/wiki/` 아래에 쌓이도록 설계되어 있다.
- 템플릿의 본질은 파일 내용보다도 폴더 역할 분리와 저장 규칙에 있다.

## Links

- [[README]]
- [[START_HERE]]
- [[TEMPLATE_MANIFEST]]
- [[AI-Sessions/wiki/projects/chatgpt-share-02-structure]]
- [[AI-Sessions/wiki/projects/chatgpt-share-03-rules-and-prompts]]
