// Hand-written differential cases for what the recorded fixtures and the
// spec tests do not reach: the add-on commands, codecs, network presets, and
// the commands that exist only when an option enables them.

const WORK = "/work";

function shell(id, preset, script, files) {
  return {
    id,
    preset,
    script,
    cwd: WORK,
    files: { [`${WORK}/.keep`]: "", ...files },
  };
}

function python(id, code, files) {
  return shell(`python:${id}`, "addons", "python3 main.py", {
    [`${WORK}/main.py`]: code,
    ...files,
  });
}

function js(id, code, file = "main.js", flags = "") {
  return shell(
    `js:${id}`,
    "addons",
    `js-exec ${flags}${flags ? " " : ""}${file}`,
    {
      [`${WORK}/${file}`]: code,
    },
  );
}

const PYTHON_MODULES = {
  json: 'import json\nprint(json.dumps({"b": 1, "a": [1, 2, {"c": None}]}, sort_keys=True, indent=2))',
  re: 'import re\nprint(re.findall(r"\\d+", "a1b22c333"), re.sub(r"(\\w)(\\w*)", lambda m: m[1].upper() + m[2], "hello big world"))',
  csv: 'import csv, io\nbuf = io.StringIO()\nw = csv.writer(buf)\nw.writerows([["a", "b,c"], [1, \'x"y\']])\nprint(buf.getvalue(), end="")\nprint(list(csv.reader(io.StringIO(buf.getvalue()))))',
  decimal:
    "from decimal import Decimal, getcontext\ngetcontext().prec = 40\nprint(Decimal(1) / Decimal(7), Decimal('0.1') + Decimal('0.2'))",
  datetime:
    "from datetime import date, datetime, timedelta, timezone\nprint(date(2024, 2, 28) + timedelta(days=2))\nprint(datetime(2020, 1, 2, 3, 4, 5, tzinfo=timezone.utc).isoformat())\nprint(datetime.strptime('2021-03-04 05:06', '%Y-%m-%d %H:%M').strftime('%A %d %B %Y %I%p'))",
  collections:
    "from collections import Counter, OrderedDict, deque, defaultdict, namedtuple\nprint(Counter('mississippi').most_common(3))\nP = namedtuple('P', 'x y')\nprint(P(1, 2), deque([1, 2, 3], maxlen=2))\nd = defaultdict(list); d['a'].append(1); print(dict(d))",
  statistics:
    "import statistics as s\ndata = [2, 4, 4, 4, 5, 5, 7, 9]\nprint(s.mean(data), s.median(data), s.pstdev(data), s.stdev(data), s.mode(data))",
  zipfile:
    "import io, zipfile\nbuf = io.BytesIO()\nwith zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:\n    z.writestr('a.txt', 'hello' * 100)\n    z.writestr('dir/b.txt', 'world')\nwith zipfile.ZipFile(io.BytesIO(buf.getvalue())) as z:\n    print(z.namelist(), z.read('a.txt')[:10], [i.file_size for i in z.infolist()])",
  tarfile:
    "import io, tarfile\nbuf = io.BytesIO()\nwith tarfile.open(fileobj=buf, mode='w:gz') as t:\n    data = b'payload'\n    info = tarfile.TarInfo('x/y.txt'); info.size = len(data); info.mtime = 0\n    t.addfile(info, io.BytesIO(data))\nwith tarfile.open(fileobj=io.BytesIO(buf.getvalue())) as t:\n    print(t.getnames(), t.extractfile('x/y.txt').read())",
  email:
    "from email.message import EmailMessage\nm = EmailMessage()\nm['Subject'] = 'Hello'\nm['To'] = 'a@example.com'\nm.set_content('Body text\\n')\nprint(m.as_string())",
  xml: "import xml.etree.ElementTree as ET\nroot = ET.fromstring('<r><i n=\"1\">a</i><i n=\"2\">b</i></r>')\nprint([(i.get('n'), i.text) for i in root.iter('i')])\nprint(ET.tostring(root, encoding='unicode'))",
  htmlparser:
    "from html.parser import HTMLParser\nclass P(HTMLParser):\n    def handle_starttag(self, tag, attrs): print('start', tag, attrs)\n    def handle_data(self, data): print('data', repr(data))\nP().feed('<p class=x>hi <b>there</b></p>')",
  urllib:
    "from urllib.parse import urlparse, urlencode, quote, parse_qs\nu = urlparse('https://user@example.com:8080/a/b?x=1&y=2#frag')\nprint(u, u.port, parse_qs(u.query), urlencode({'a': 'b c', 'd': '&'}), quote('/a b/ü'))",
  pathlib:
    "from pathlib import PurePosixPath, Path\np = PurePosixPath('/a/b/c.tar.gz')\nprint(p.name, p.suffix, p.suffixes, p.stem, p.parent, p.with_suffix('.zip'))\nPath('/work/out').mkdir(exist_ok=True)\nPath('/work/out/f.txt').write_text('written')\nprint(sorted(str(x) for x in Path('/work/out').iterdir()), Path('/work/out/f.txt').read_text())",
  dataclasses:
    "from dataclasses import dataclass, field, asdict\n@dataclass(order=True)\nclass C:\n    a: int\n    b: list = field(default_factory=list)\nprint(C(1), asdict(C(2, [3])), sorted([C(3), C(1)]))",
  typing:
    "from typing import get_type_hints, Optional, TypedDict\nclass T(TypedDict):\n    a: int\ndef f(x: int, y: Optional[str] = None) -> list[int]: return []\nprint(get_type_hints(f), T.__annotations__)",
  asyncio:
    "import asyncio\nasync def work(n):\n    await asyncio.sleep(0)\n    return n * 2\nasync def main():\n    print(await asyncio.gather(*(work(i) for i in range(5))))\nasyncio.run(main())",
  unittest:
    "import io, unittest\nclass T(unittest.TestCase):\n    def test_ok(self): self.assertEqual(1 + 1, 2)\n    def test_fail(self): self.assertEqual(1, 2)\nresult = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(T))\nprint(result.testsRun, len(result.failures), result.wasSuccessful())",
  hashlib:
    "import hashlib\nfor name in ['md5', 'sha1', 'sha256', 'sha512', 'blake2b', 'sha3_256']:\n    print(name, hashlib.new(name, b'abc').hexdigest())",
  base64:
    "import base64, binascii\nprint(base64.b64encode(b'\\x00\\xffhello'), base64.b32encode(b'hi'), base64.urlsafe_b64decode('aGk_'), binascii.hexlify(b'ab'))",
  zlib: "import zlib, gzip\ndata = b'abc' * 1000\nc = zlib.compress(data, 9)\nprint(len(c), zlib.crc32(data), zlib.adler32(data), zlib.decompress(c) == data)\nprint(gzip.decompress(gzip.compress(data, mtime=0)) == data, len(gzip.compress(data, mtime=0)))",
  bz2: "import bz2\ndata = b'xyz' * 1000\nc = bz2.compress(data)\nprint(len(c), bz2.decompress(c) == data)",
  struct:
    "import struct\nprint(struct.pack('<IhQ?', 1, -2, 3, True), struct.unpack('>f', b'@I\\x0f\\xdb'), struct.calcsize('@iqc'))",
  difflib:
    "import difflib\nprint(''.join(difflib.unified_diff(['a\\n', 'b\\n', 'c\\n'], ['a\\n', 'B\\n', 'c\\n'], 'x', 'y')))\nprint(difflib.get_close_matches('appel', ['ape', 'apple', 'peach']))",
  fractions:
    "from fractions import Fraction\nimport math\nprint(Fraction(3, 4) + Fraction(1, 6), Fraction('0.125'), math.gcd(12, 18), math.comb(10, 3), math.isqrt(99), math.pi)",
  uuid: "import uuid\nu = uuid.UUID(int=0x12345678123456781234567812345678)\nprint(u, u.version, uuid.uuid5(uuid.NAMESPACE_DNS, 'example.com'), uuid.uuid3(uuid.NAMESPACE_URL, 'x'))",
  random:
    "import random\nrandom.seed(42)\nprint(random.random(), random.randint(1, 100), random.sample(range(100), 5), random.choice('abcdef'))\nr = random.Random(7); l = list(range(10)); r.shuffle(l); print(l)",
  itertools:
    "import itertools, functools, operator\nprint(list(itertools.permutations('abc', 2)), list(itertools.accumulate([1, 2, 3, 4])), functools.reduce(operator.mul, range(1, 6)))\nprint(list(itertools.groupby('aabbbc')) and [(k, len(list(g))) for k, g in itertools.groupby('aabbbc')])",
  textwrap:
    "import textwrap, string, pprint, shlex, heapq, bisect, enum\nprint(textwrap.fill('The quick brown fox jumps over the lazy dog ' * 3, width=30))\nprint(string.Template('$a-$b').substitute(a=1, b=2), shlex.split('a \"b c\" d'), heapq.nsmallest(2, [5, 1, 4]), bisect.bisect([1, 3, 5], 4))\nclass Color(enum.Enum):\n    RED = 1\npprint.pprint({'z': list(range(30)), 'a': Color.RED})",
  sysinfo:
    "import sys, os\nprint(sys.version_info[:3], sys.platform, sys.implementation.name, sys.maxsize, sys.byteorder)\nprint(sys.argv, os.getcwd(), sys.path)",
  osfs: "import os, glob, shutil\nos.makedirs('/work/a/b', exist_ok=True)\nopen('/work/a/b/x.txt', 'w').write('x')\nshutil.copy('/work/a/b/x.txt', '/work/a/y.txt')\nprint(sorted(glob.glob('/work/a/**', recursive=True)), os.path.getsize('/work/a/y.txt'), os.path.exists('/nope'))",
  encoding:
    "s = 'héllo wörld ✓ 𝄞'\nprint(s, len(s), s.encode('utf-8'), s.encode('latin-1', 'replace'), 'ß'.upper(), 'İ'.lower())",
  failingImports:
    "for name in ['turtle', 'tkinter', 'ctypes', 'ssl', 'curses', 'sqlite3', 'lzma', 'zoneinfo', 'pydoc', 'readline', '_hashlib', 'venv', 'ensurepip', 'test']:\n    try:\n        __import__(name)\n        print(name, 'ok')\n    except BaseException as error:\n        print(name, type(error).__name__, error)",
  workingImports:
    "for name in ['multiprocessing', 'webbrowser', 'dbm', 'socket', 'select', 'concurrent.futures', 'pyexpat', 'pdb', 'tomllib', 'calendar', 'locale', 'gettext', 'logging.handlers', 'http.client', 'http.server', 'xmlrpc.client', 'wsgiref.simple_server', 'imaplib', 'smtplib', 'ftplib', 'mailbox', 'cProfile', 'trace', 'timeit', 'doctest', 'argparse', 'optparse', 'getopt', 'configparser', 'plistlib', 'pickle', 'shelve', 'secrets', 'hmac', 'ipaddress', 'graphlib', 'contextvars', 'weakref', 'abc', 'numbers', 'cmath', 'array', 'mmap', 'unicodedata', 'codecs', 'stringprep', 'quopri', 'wave', 'colorsys', 'filecmp', 'fileinput', 'tempfile', 'linecache', 'tokenize', 'ast', 'dis', 'inspect', 'symtable', 'compileall', 'py_compile', 'zipapp', 'zipimport', 'pkgutil', 'importlib.metadata', 'sysconfig', 'platform', 'errno', 'signal', 'threading', 'queue', 'sched', 'subprocess', 'selectors', 'asyncio.subprocess', 'json.tool', 'xml.dom.minidom', 'xml.sax', 'html.entities', 'email.mime.text', 'urllib.request', 'http.cookiejar']:\n    try:\n        __import__(name)\n        print(name, 'ok')\n    except BaseException as error:\n        print(name, type(error).__name__, error)",
  calendar:
    "import calendar\nprint(calendar.month(2024, 2))\nprint(calendar.isleap(2100), calendar.weekday(2000, 1, 1))",
  pickle:
    "import pickle, copy\nobj = {'a': [1, 2, (3, 4)], 'b': {1, 2}}\nprint(pickle.loads(pickle.dumps(obj)) == obj, copy.deepcopy(obj) == obj, len(pickle.dumps(obj, protocol=4)))",
  ipaddress:
    "import ipaddress\nn = ipaddress.ip_network('10.0.0.0/30')\nprint(list(n.hosts()), ipaddress.ip_address('::1').is_loopback, ipaddress.ip_address('192.168.1.1').is_private)",
  unicodedata:
    "import unicodedata\nprint(unicodedata.name('é'), unicodedata.normalize('NFD', 'é').encode(), unicodedata.category('A'))",
};

function pythonCases() {
  const cases = Object.entries(PYTHON_MODULES).map(([id, code]) =>
    python(id, `${code}\n`),
  );
  cases.push(
    shell(
      "python:version",
      "addons",
      "python3 --version; python --version; python3 -V",
    ),
    shell(
      "python:inline",
      "addons",
      "python3 -c 'print(\"hi\")'; python -c 'print(2 ** 100)'",
    ),
    shell("python:help", "addons", "python3 --help"),
    shell("python:bad-option", "addons", "python3 -Z; echo status=$?"),
    shell("python:missing-file", "addons", "python3 /nope.py; echo status=$?"),
    shell(
      "python:traceback",
      "addons",
      "python3 -c 'def f():\n    return 1 / 0\nf()'; echo status=$?",
    ),
    shell(
      "python:syntax-error",
      "addons",
      "python3 -c 'def ('; echo status=$?",
    ),
    shell(
      "python:system-exit",
      "addons",
      "python3 -c 'import sys; sys.exit(3)'; echo status=$?; python3 -c 'raise SystemExit(\"bye\")'; echo status=$?",
    ),
    shell(
      "python:uncaught-custom",
      "addons",
      "python3 -c 'class E(Exception): pass\nraise E(\"custom\")'; echo status=$?",
    ),
    shell(
      "python:stdin",
      "addons",
      "printf 'b\\na\\nc\\n' | python3 -c 'import sys; print(sorted(sys.stdin.read().split()))'",
    ),
    shell(
      "python:stdin-script",
      "addons",
      "printf 'print(40 + 2)\\n' | python3 -",
    ),
    shell(
      "python:json-tool",
      "addons",
      'echo \'{"b":1,"a":[1,2]}\' | python3 -m json.tool',
    ),
    shell(
      "python:argv",
      "addons",
      "python3 -c 'import sys; print(sys.argv)' x 'y z'",
    ),
    shell(
      "python:read-vfs",
      "addons",
      'python3 -c \'print(open("/work/data.txt").read().upper(), end="")\'',
      { [`${WORK}/data.txt`]: "abc\ndef\n" },
    ),
    shell(
      "python:write-vfs",
      "addons",
      'python3 -c \'open("/work/o.txt", "w").write("from python\\n")\' && cat /work/o.txt && wc -c /work/o.txt',
    ),
    shell(
      "python:pipeline",
      "addons",
      "seq 1 5 | python3 -c 'import sys; print(sum(int(l) for l in sys.stdin))' | tr 0-9 a-j",
    ),
    shell(
      "python:env",
      "addons",
      'FOO=bar python3 -c \'import os; print(os.environ.get("FOO"), os.environ.get("HOME"))\'',
    ),
    shell(
      "python:raw-import-error",
      "addons",
      "python3 -c 'import ssl'; echo status=$?",
    ),
    shell(
      "python:alias",
      "addons",
      "python -c 'import sys; print(sys.executable)'",
    ),
  );
  return cases;
}

function jsCases() {
  return [
    shell(
      "js:inline",
      "addons",
      "js-exec -c 'console.log(1 + 2, [1, 2].map((x) => x * 2), {a: 1})'",
    ),
    shell(
      "js:ts-inline",
      "addons",
      "js-exec -c 'interface P { a: string }\nconst x: number = 41;\nfunction id<T>(v: T): T { return v }\nconst p: P = { a: \"s\" };\nconsole.log(id<number>(x + 1), p.a as string)'",
    ),
    js(
      "ts-script-file",
      "type T = { n: number };\nconst t: T = { n: 2 };\nfunction twice<A>(f: (a: A) => A, a: A): A { return f(f(a)); }\nconsole.log(twice<number>((v) => v * 3, t.n));\n",
      "main.ts",
    ),
    js("ts-enum", "enum Kind { A = 1, B }\nconsole.log(Kind.B);\n", "main.ts"),
    js(
      "ts-module-file",
      "export {};\ninterface Box<T> { value: T }\nconst b: Box<string> = { value: 'boxed' };\nconst r = await Promise.resolve(b.value satisfies string);\nconsole.log(r);\n",
      "main.mts",
    ),
    js("ts-in-js-file", "const x: number = 5;\nconsole.log(x * 2);\n"),
    js(
      "module-flag",
      "import path from 'path';\nexport const v = path.join('a', 'b');\nconsole.log(v);\n",
      "main.js",
      "-m",
    ),
    js(
      "require-shims",
      "const path = require('path');\nconst util = require('util');\nconst os = require('os');\nconst { Buffer } = require('buffer');\nconst EventEmitter = require('events');\nconst e = new EventEmitter(); e.on('x', (v) => console.log('event', v)); e.emit('x', 1);\nconsole.log(path.basename('/x/y.txt'), util.format('%s=%d', 'a', 1), typeof os.platform(), Buffer.from('hi').toString('hex'));\nconsole.log(require('url').parse ? 'url ok' : 'no url', require('querystring').stringify({a: 1, b: 'c d'}));\n",
    ),
    js(
      "require-fs",
      "const fs = require('fs');\nfs.writeFileSync('/work/js.txt', 'from js\\n');\nconsole.log(fs.readFileSync('/work/js.txt', 'utf8').trim(), fs.existsSync('/nope'), fs.readdirSync('/work').sort());\n",
    ),
    js(
      "require-unsupported",
      "try { require('child_process'); } catch (e) { console.log('child_process:', e.message); }\ntry { require('net'); } catch (e) { console.log('net:', e.message); }\ntry { require('./missing'); } catch (e) { console.log('missing:', e.message); }\n",
    ),
    js(
      "assert",
      "const assert = require('assert');\nassert.strictEqual(1, 1);\ntry { assert.deepStrictEqual({a: 1}, {a: 2}); } catch (e) { console.log(e.name, e.code); }\n",
    ),
    shell(
      "js:throw",
      "addons",
      "js-exec -c 'throw new Error(\"boom\")'; echo status=$?",
    ),
    shell("js:syntax-error", "addons", "js-exec -c 'let = ;'; echo status=$?"),
    shell(
      "js:exit-code",
      "addons",
      "js-exec -c 'console.log(\"before\"); process.exit(4)'; echo status=$?",
    ),
    shell(
      "js:stderr",
      "addons",
      'js-exec -c \'console.error("to stderr"); console.warn("warned")\'',
    ),
    shell(
      "js:stdin",
      "addons",
      'echo hello | js-exec -c \'const fs = require("fs"); console.log(fs.readFileSync(0, "utf8").toUpperCase())\'; echo status=$?',
    ),
    shell(
      "js:argv",
      "addons",
      "js-exec -c 'console.log(process.argv.slice(2))' a b",
    ),
    shell("js:help", "addons", "js-exec --help"),
    shell("js:missing-file", "addons", "js-exec /nope.js; echo status=$?"),
    shell(
      "js:node-stub",
      "addons",
      "node -e 'console.log(1)'; echo status=$?; node --version; echo status=$?; node main.js; echo status=$?",
      { [`${WORK}/main.js`]: "console.log('node file');\n" },
    ),
    shell(
      "js:json-date",
      "addons",
      "js-exec -c 'console.log(JSON.stringify({d: new Date(0)}), new Date(0).toISOString(), (1234.5).toFixed(2), [3,1,2].sort())'",
    ),
    shell(
      "js:infinite-loop",
      "addons",
      "js-exec -c 'while (true) {}'; echo status=$?",
    ),
    {
      ...shell("js:fetch", "fetch-addons", "js-exec -m main.mjs", {
        [`${WORK}/main.mjs`]:
          "const r = await fetch('https://x.test/json');\nconsole.log(r.status, await r.text());\n",
      }),
    },
  ];
}

function sqliteCases() {
  const query =
    "create table t(a integer, b text); insert into t values (1, 'x'), (2, 'y,z'), (3, NULL); select * from t order by a;";
  const modes = [
    "-list",
    "-csv",
    "-json",
    "-line",
    "-column",
    "-table",
    "-markdown",
    "-tabs",
    "-box",
    "-html",
  ];
  return [
    shell(
      "sqlite:basic",
      "default",
      "sqlite3 :memory: 'select 1 + 1, upper(\"abc\"), typeof(1.5)'",
    ),
    ...modes.map((mode) =>
      shell(
        `sqlite:mode${mode}`,
        "default",
        `sqlite3 ${mode} -header :memory: "${query}"`,
      ),
    ),
    shell(
      "sqlite:file-db",
      "default",
      "sqlite3 /work/t.db 'create table t(a, b); insert into t values (1, \"x\"), (2, \"y\");' && sqlite3 /work/t.db 'select count(*), group_concat(b) from t' && wc -c < /work/t.db && sqlite3 /work/t.db .tables && sqlite3 /work/t.db .schema",
    ),
    shell(
      "sqlite:errors",
      "default",
      "sqlite3 :memory: 'selec 1'; echo status=$?; sqlite3 :memory: 'select * from missing'; echo status=$?; sqlite3 -bogus :memory: 'select 1'; echo status=$?",
    ),
    shell("sqlite:version", "default", "sqlite3 --version; sqlite3 -version"),
    shell(
      "sqlite:stdin",
      "default",
      'printf \'select 42;\\nselect "a" || "b";\\n\' | sqlite3 :memory:',
    ),
    shell("sqlite:help", "default", "sqlite3 --help"),
    shell(
      "sqlite:json-functions",
      "default",
      "sqlite3 :memory: \"select json_extract('{\\\"a\\\":[1,2]}', '\\$.a[1]'), json_array(1, 'x'), sqlite_version() is not null\"",
    ),
    shell(
      "sqlite:separator",
      "default",
      "sqlite3 -separator '|' :memory: \"select 1, 'two', 3.5\"",
    ),
  ];
}

function htmlCases() {
  const inputs = {
    basic:
      '<h1>Title</h1><p>Some <b>bold</b> and <i>italic</i> and <a href="https://example.com">a link</a>.</p>',
    lists:
      "<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><ol><li>first</li><li>second</li></ol>",
    table:
      "<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>",
    code: '<pre><code class="language-js">const x = 1;\nconsole.log(x);</code></pre><p>inline <code>code</code></p>',
    removed:
      "<script>alert(1)</script><style>p{}</style><footer>foot</footer><p>kept</p>",
    entities:
      '<p>&lt;tag&gt; &amp; &quot;quotes&quot; &copy; &#8364; &nbsp;x</p><blockquote>quoted</blockquote><hr><img src="a.png" alt="pic">',
    malformed: "<p>unclosed <b>bold<p>next <div>div</span>",
  };
  return [
    ...Object.entries(inputs).map(([id, html]) =>
      shell(`html:${id}`, "default", "html-to-markdown page.html", {
        [`${WORK}/page.html`]: html,
      }),
    ),
    shell(
      "html:stdin",
      "default",
      "echo '<h2>From stdin</h2><p>x</p>' | html-to-markdown",
    ),
    shell("html:help", "default", "html-to-markdown --help"),
    shell(
      "html:missing",
      "default",
      "html-to-markdown /nope.html; echo status=$?",
    ),
  ];
}

function archiveCases() {
  const files = {
    [`${WORK}/d/a.txt`]: "alpha\n".repeat(200),
    [`${WORK}/d/sub/b.txt`]: "bravo\n",
    [`${WORK}/d/empty.txt`]: "",
  };
  const roundtrip = (flag, name) =>
    `touch -d @0 d/a.txt d/sub/b.txt d/empty.txt d/sub d; tar ${flag} -cf ${name} d; echo create=$?; tar ${flag} -tf ${name} | sort; mkdir -p out && tar ${flag} -xf ${name} -C out; echo extract=$?; md5sum d/a.txt d/sub/b.txt out/d/a.txt out/d/sub/b.txt 2>&1; wc -c < ${name}; base64 ${name} | md5sum`;
  return [
    shell("tar:plain", "default", roundtrip("", "a.tar"), files),
    shell("tar:gzip", "default", roundtrip("-z", "a.tgz"), files),
    shell("tar:bzip2", "default", roundtrip("-j", "a.tbz2"), files),
    shell("tar:xz", "default", roundtrip("-J", "a.txz"), files),
    shell("tar:zstd", "default", roundtrip("--zstd", "a.tzst"), files),
    shell(
      "tar:auto",
      "default",
      'touch -d @0 d/a.txt; for f in x.tar.gz x.tar.bz2 x.tar.xz x.tar.zst; do tar -caf $f d; echo "$f $?"; tar -tf $f | sort; done',
      files,
    ),
    shell(
      "tar:verbose-list",
      "default",
      "touch -d @0 d/a.txt d/sub/b.txt d/empty.txt d/sub d; tar -czf a.tgz d && tar -tvzf a.tgz",
      files,
    ),
    shell(
      "tar:errors",
      "default",
      "tar -xf missing.tar; echo status=$?; echo garbage > bad.tgz; tar -xzf bad.tgz; echo status=$?; tar -xJf bad.tgz; echo status=$?; tar --zstd -xf bad.tgz; echo status=$?; tar -xjf bad.tgz; echo status=$?",
    ),
    shell("tar:help", "default", "tar --help"),
    shell(
      "gzip:roundtrip",
      "default",
      "printf 'hello world\\n' > h.txt; gzip -n -c h.txt | base64; gzip -c h.txt | gunzip; gzip h.txt; ls; zcat h.txt.gz; gunzip h.txt.gz; cat h.txt; echo abc | gzip -9 -n | wc -c; echo corrupt | gunzip; echo status=$?",
    ),
    shell(
      "gzip:levels",
      "default",
      "seq 1 2000 > n.txt; for l in 1 6 9; do gzip -$l -n -c n.txt | md5sum; done; gzip -l n.txt 2>&1; gzip -t n.txt; echo status=$?",
    ),
  ];
}

function dataCases() {
  return [
    shell(
      "file:types",
      "default",
      "printf '\\x89PNG\\r\\n\\x1a\\n\\x00\\x00\\x00\\rIHDR' > img.png; printf '%%PDF-1.4\\n' > doc.pdf; printf 'PK\\x03\\x04' > a.zip; echo '#!/bin/sh' > s.sh; echo plain > t.txt; printf '{\"a\":1}' > j.json; printf '\\x1f\\x8b\\x08\\x00' > z.gz; file img.png doc.pdf a.zip s.sh t.txt j.json z.gz /work; file -b t.txt; file --mime-type img.png",
    ),
    shell(
      "yq:formats",
      "default",
      "yq '.a.b' doc.yaml; yq -o json doc.yaml; yq -p xml -o json '.' doc.xml; yq -p toml -o yaml '.' doc.toml; yq -p csv -o json '.' doc.csv; yq -p ini -o json '.' doc.ini; yq -o xml '.' doc.yaml; yq -o toml '.' doc.yaml",
      {
        [`${WORK}/doc.yaml`]:
          'a:\n  b: [1, 2, {c: d}]\n  e: "str"\nlist:\n  - x\n  - y\n',
        [`${WORK}/doc.xml`]:
          '<root><item id="1">a</item><item id="2">b</item></root>',
        [`${WORK}/doc.toml`]:
          'title = "t"\n[owner]\nname = "n"\ndob = 1979-05-27T07:32:00Z\n[[arr]]\nx = 1\n',
        [`${WORK}/doc.csv`]: "name,age\nann,30\nbob,40\n",
        [`${WORK}/doc.ini`]: "[section]\nkey=value\nnum=1\n",
      },
    ),
    shell(
      "yq:errors",
      "default",
      "echo 'a: [' | yq '.'; echo status=$?; yq -p nope '.' /dev/null; echo status=$?",
    ),
    shell(
      "xan:basic",
      "default",
      "xan headers people.csv; xan count people.csv; xan select name people.csv; xan sort -s age people.csv; xan filter 'age > 30' people.csv; xan stats people.csv 2>&1 | head -5; xan frequency -s city people.csv",
      {
        [`${WORK}/people.csv`]:
          "name,age,city\nann,30,paris\nbob,40,rome\ncid,25,paris\n",
      },
    ),
    shell(
      "jq:complex",
      "default",
      'echo \'[{"a":1,"b":"x"},{"a":2,"b":"y"},{"a":3}]\' | jq -c \'map(select(.a > 1)) | group_by(.b) | map({k: (.[0].b // "none"), n: length})\'; echo \'{"a":{"b":[1,2,3]}}\' | jq \'[paths(..)] | length, (.a.b | add), (.. | numbers)\' ; jq -n \'[range(5)] | @csv, @tsv, @json, @base64\'; jq -n \'now | type\'; echo \'"2015-03-05T23:51:47Z"\' | jq \'fromdate | todate\'',
    ),
    shell(
      "diff:basic",
      "default",
      "diff a.txt b.txt; echo status=$?; diff -q a.txt b.txt; diff a.txt a.txt; echo status=$?; diff -c a.txt b.txt | tail -n +3; diff -i a.txt c.txt; echo status=$?",
      {
        [`${WORK}/a.txt`]: "one\ntwo\nthree\nfour\n",
        [`${WORK}/b.txt`]: "one\n2\nthree\nfour\nfive\n",
        [`${WORK}/c.txt`]: "ONE\nTWO\nTHREE\nFOUR\n",
      },
    ),
    shell(
      "diff:unified",
      "default",
      "diff -u a.txt b.txt | tail -n +3; diff -u --label x --label y a.txt b.txt",
      {
        [`${WORK}/a.txt`]: "1\n2\n3\n4\n5\n6\n7\n8\n9\n",
        [`${WORK}/b.txt`]: "1\n2\nthree\n4\n5\n6\n7\n8\nnine\n10\n",
      },
    ),
    shell(
      "printf:formats",
      "default",
      "printf '%5.2f|%-6s|%06d|%x|%X|%o|%e|%g|%G|%c|%%\\n' 3.14159 ab 42 255 255 8 12345.678 0.0001 1e20 xyz; printf '%s\\n' a b c; printf '%b\\n' 'tab\\there' 'nl\\nx'; printf '%q\\n' 'a b' \"it's\" '$x'; printf '%*d|%-*d|\\n' 5 1 4 2; printf '%.3s|%10.4f|%+d|% d\\n' abcdef 2.5 5 7; printf '%d\\n' 0x1f 010 \"'A\"; printf '%s' ; echo status=$?; printf '%d\\n' abc; echo status=$?; printf '%(%Y)T\\n' 0",
    ),
    shell(
      "printf:unicode",
      "default",
      "printf '%-5s|%5s|\\n' é ✓; printf '\\u00e9 \\U0001F600 \\x41 \\101\\n'",
    ),
    shell(
      "misc:text",
      "default",
      "printf 'b 2\\na 1\\nc 3\\n' > f; sort -k2 -n f; sort -r f; cut -d' ' -f1 f | tr a-z A-Z | rev; awk '{s+=$2} END {print s, NR}' f; sed -n '2p;$p' f; nl f; wc f; uniq -c <(printf 'a\\na\\nb\\n'); column -t f; fold -w 2 f | head -3; expand <(printf 'a\\tb\\n'); od -c <(printf 'ab\\n'); base64 f; md5sum f; sha1sum f; sha256sum f; seq -s, 1 5; expr 3 \\* 4; echo $((2**40)); basename /a/b.c .c; dirname /a/b/c; rg -n 'a' f; grep -c . f",
    ),
    shell(
      "misc:help",
      "default",
      "help | head -20; help cd; help -s echo; which ls cat python3 sqlite3 js-exec curl; echo status=$?; type ls cd; command -v sqlite3 html-to-markdown tar",
    ),
  ];
}

const HELP_COMMANDS = [
  "ls",
  "cat",
  "grep",
  "rg",
  "sed",
  "awk",
  "sort",
  "uniq",
  "cut",
  "tr",
  "head",
  "tail",
  "wc",
  "find",
  "xargs",
  "jq",
  "yq",
  "xan",
  "diff",
  "date",
  "seq",
  "printf",
  "echo",
  "tar",
  "gzip",
  "gunzip",
  "zcat",
  "file",
  "md5sum",
  "sha256sum",
  "base64",
  "od",
  "stat",
  "tree",
  "du",
  "env",
  "timeout",
  "time",
  "split",
  "join",
  "paste",
  "column",
  "comm",
  "nl",
  "fold",
  "expand",
  "strings",
  "tee",
  "mkdir",
  "rm",
  "cp",
  "mv",
  "ln",
  "chmod",
  "touch",
  "readlink",
  "mktemp",
  "rmdir",
  "basename",
  "dirname",
  "sleep",
  "expr",
  "hostname",
  "whoami",
  "tac",
  "rev",
  "which",
  "history",
  "alias",
  "bash",
  "sh",
  "sqlite3",
  "html-to-markdown",
];

function defaultPresetCases() {
  return [
    ...HELP_COMMANDS.map((command) =>
      shell(`help:${command}`, "default", `${command} --help; echo status=$?`),
    ),
    shell(
      "default:curl",
      "default",
      "curl https://example.com; echo status=$?",
    ),
    shell("default:wget", "default", "wget x; echo status=$?"),
    shell(
      "default:curl-lookup",
      "default",
      "type curl; echo status=$?; command -v curl wget; echo status=$?; which curl; echo status=$?; ls /usr/bin/curl /bin/curl; echo status=$?",
    ),
    shell(
      "default:python",
      "default",
      "python3 -c 1; echo status=$?; python -c 1; echo status=$?",
    ),
    shell(
      "default:js",
      "default",
      "js-exec -c 1; echo status=$?; node -e 1; echo status=$?",
    ),
    shell(
      "default:sqlite-html",
      "default",
      "sqlite3 :memory: 'select 7'; echo '<b>x</b>' | html-to-markdown",
    ),
    shell(
      "default:bin-listing",
      "default",
      "ls /bin | head -200 | tr '\\n' ' '; echo; ls /usr/bin | wc -l",
    ),
  ];
}

function fetchCases() {
  const base = "https://x.test";
  return [
    shell("curl:get", "fetch", `curl -s ${base}/json; echo status=$?`),
    shell("curl:head", "fetch", `curl -sI ${base}/json; echo status=$?`),
    shell("curl:include", "fetch", `curl -si ${base}/json`),
    shell(
      "curl:output",
      "fetch",
      `curl -s -o /work/out.json ${base}/json; echo status=$?; cat /work/out.json; curl -sO ${base}/named.txt; cat named.txt`,
    ),
    shell(
      "curl:writeout",
      "fetch",
      `curl -s -o /dev/null -w '%{http_code} %{url_effective} %{content_type} %{size_download}\\n' ${base}/notfound`,
    ),
    shell(
      "curl:data",
      "fetch",
      `curl -s -d 'a=1&b=2' ${base}/echo; curl -s --data-urlencode 'q=a b' ${base}/echo; curl -s -d @body.txt ${base}/echo`,
      { [`${WORK}/body.txt`]: "file body\n" },
    ),
    shell(
      "curl:post-json",
      "fetch",
      `curl -s -X POST -H 'Content-Type: application/json' -H 'X-Test: 1' -d '{"a":1}' ${base}/echo`,
    ),
    shell(
      "curl:methods",
      "fetch",
      `for m in GET PUT DELETE PATCH OPTIONS; do curl -s -X $m ${base}/echo; done`,
    ),
    shell(
      "curl:fail",
      "fetch",
      `curl --fail ${base}/notfound; echo status=$?; curl -f -s ${base}/error; echo status=$?; curl -s ${base}/error; echo status=$?; curl -sS --fail-with-body ${base}/notfound; echo status=$?`,
    ),
    shell(
      "curl:redirect",
      "fetch",
      `curl -s ${base}/redirect; echo status=$?; curl -sL ${base}/redirect; echo status=$?; curl -sIL ${base}/redirect`,
    ),
    shell(
      "curl:binary",
      "fetch",
      `curl -s ${base}/binary | od -An -tx1 | head -3; curl -s ${base}/binary | wc -c`,
    ),
    shell("curl:verbose", "fetch", `curl -v -s ${base}/json`),
    shell(
      "curl:user-agent-auth",
      "fetch",
      `curl -s -A 'agent/1' -u user:pass -b 'k=v' -e https://ref.test/ ${base}/echo`,
    ),
    shell(
      "curl:form",
      "fetch",
      `curl -s -F 'a=1' -F 'f=@body.txt' ${base}/echo | head -c 300`,
      { [`${WORK}/body.txt`]: "upload\n" },
    ),
    shell(
      "curl:dump-header",
      "fetch",
      `curl -s -D headers.txt ${base}/json > /dev/null; cat headers.txt`,
    ),
    shell(
      "curl:errors",
      "fetch",
      "curl; echo status=$?; curl --bogus https://x.test/; echo status=$?; curl -s 'not a url'; echo status=$?; curl --help | head -20",
    ),
    shell(
      "curl:stdin-data",
      "fetch",
      `printf 'from stdin' | curl -s -d @- ${base}/echo`,
    ),
  ];
}

function networkDeniedCases() {
  return [
    shell(
      "net:host-denied",
      "network-denied",
      "curl -s https://example.com/; echo status=$?; curl https://example.com/; echo status=$?",
    ),
    shell(
      "net:path-denied",
      "network-denied",
      "curl -s https://allowed.invalid/secret; echo status=$?",
    ),
    shell(
      "net:method-denied",
      "network-denied",
      "curl -s -X POST -d x https://allowed.invalid/api/x; echo status=$?",
    ),
    shell(
      "net:private-ip",
      "network-denied",
      "curl -s http://127.0.0.1/; echo status=$?; curl -s http://169.254.169.254/latest/meta-data; echo status=$?; curl -s 'http://[::1]/'; echo status=$?",
    ),
    shell(
      "net:scheme",
      "network-denied",
      "curl -s file:///etc/passwd; echo status=$?; curl -s ftp://allowed.invalid/api/x; echo status=$?",
    ),
    shell(
      "net:dns-failure",
      "network-denied",
      "curl -s https://allowed.invalid/api/x; echo status=$?; curl -sS https://allowed.invalid/api/x; echo status=$?",
    ),
    shell(
      "net:writeout-denied",
      "network-denied",
      "curl -s -o /dev/null -w '%{http_code}\\n' https://example.com/; echo status=$?",
    ),
  ];
}

export function customCases() {
  return [
    ...pythonCases(),
    ...jsCases(),
    ...sqliteCases(),
    ...htmlCases(),
    ...archiveCases(),
    ...dataCases(),
    ...defaultPresetCases(),
    ...fetchCases(),
    ...networkDeniedCases(),
  ];
}
