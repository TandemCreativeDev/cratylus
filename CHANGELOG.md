# Changelog

## [0.2.0](https://github.com/TandemCreativeDev/cratylus/compare/v0.1.0...v0.2.0) (2026-11-25)


### Features

* **branch:** add ignore globs for names that skip the check ([7b8938c](https://github.com/TandemCreativeDev/cratylus/commit/7b8938c0f0532772c173dcca6928b3d0c00b77a4))
* **branch:** point at the part of a ticket id that matched ([75e285b](https://github.com/TandemCreativeDev/cratylus/commit/75e285b62c2f0ff60e471118b1af5933a4732578))
* **cli:** add pre-push command and document -- before branch names ([73290d4](https://github.com/TandemCreativeDev/cratylus/commit/73290d4957a7a3f378c2bc432eea38b28085b77d))
* **config:** add branchTicket and refTicket patterns ([a03878b](https://github.com/TandemCreativeDev/cratylus/commit/a03878bd838e7e1bb3aa96304b9dae94027997f6))
* **pr:** require the branch ticket in references with matchBranchTicket ([cf97898](https://github.com/TandemCreativeDev/cratylus/commit/cf97898d9589801b7a40e3c65f753ba871e20781))
* **refs:** add keywords option and accept owner/repo# and issue URLs ([f36f415](https://github.com/TandemCreativeDev/cratylus/commit/f36f41594341793682225234beab6c41c844914e))


### Bug Fixes

* **branch:** reject dates before 2000 or after tomorrow ([bd0779a](https://github.com/TandemCreativeDev/cratylus/commit/bd0779abf8a12f2b13f748400332bb3b2d8a3f68))
* **refs:** reject ids that run into a hyphen and negated keywords ([92ac9e0](https://github.com/TandemCreativeDev/cratylus/commit/92ac9e0b470d450a1d8b85c529266f4d792b9d99))

## 0.1.0 (2026-11-22)


### Features

* **branch:** validate and build branch names ([4f281e1](https://github.com/TandemCreativeDev/cratylus/commit/4f281e12fc133242212883737cd9d212bdc0d05f))
* **cli:** add init, branch, name, refs and pr commands ([8a098df](https://github.com/TandemCreativeDev/cratylus/commit/8a098df46f94a4fc1efa5c0e9587efb4367cc6bf))
* **config:** add config defaults and hand-written validation ([2749857](https://github.com/TandemCreativeDev/cratylus/commit/2749857f5ad0675dfce7dc9d59bb5c9ec9a3ebf3))
* **pr:** check a pull request names a ticket and read event payloads ([232ca3c](https://github.com/TandemCreativeDev/cratylus/commit/232ca3c58d6588c1dd6ffdf3882962d5786348a8))
* **refs:** extract closes references outside code and comments ([98d98db](https://github.com/TandemCreativeDev/cratylus/commit/98d98db1fa3aaff3719933312d698d4c5c82b067))


### Bug Fixes

* **branch:** blame a bad description before an impossible date ([445fdff](https://github.com/TandemCreativeDev/cratylus/commit/445fdffc4727a95a6ac7187d993da2796a003188))
* **branch:** read one-word dated names, validate builder tickets and skip empty ids ([6a9f1b5](https://github.com/TandemCreativeDev/cratylus/commit/6a9f1b58b5d090fa300c84cbc24df727c80be0f8))
* **branch:** report the real fault and refuse titles that read as tickets ([66abf04](https://github.com/TandemCreativeDev/cratylus/commit/66abf047a8b919e2607fb299d00309a6ae4d0947))
* **cli:** print json errors, reject stray arguments and let flags decide alone ([f6807f5](https://github.com/TandemCreativeDev/cratylus/commit/f6807f562e056d624a849bf7482782b5616e494f))
* **cli:** use the event payload as the base for label and bot flags ([717e164](https://github.com/TandemCreativeDev/cratylus/commit/717e164be5bea0050461d70d778502af446cb833))
* **config:** reject ticket patterns that are empty, capturing or anchored ([b05ed8c](https://github.com/TandemCreativeDev/cratylus/commit/b05ed8cda92a034a1e0f1a88754d503255e23b7e))
* **pr:** accept a null user and assert the whole bot result ([1a4ecfd](https://github.com/TandemCreativeDev/cratylus/commit/1a4ecfd602079eaea6c81f61801657c9a300a1c5))
* **refs:** mask code and comments in one scan and keep matching linear ([ae40b3b](https://github.com/TandemCreativeDev/cratylus/commit/ae40b3b4184e1496fc345a1d262c629d70afa0fa))
* **refs:** normalise line endings, let fences end spans and skip empty ids ([526572f](https://github.com/TandemCreativeDev/cratylus/commit/526572f01abd4e861e8be1cf11db8e55926b9ba5))
* **refs:** recognise fences opened on list lines and ratio-test timing ([aaaac21](https://github.com/TandemCreativeDev/cratylus/commit/aaaac21a2d8be4dc15a6c678c89b524724198498))
