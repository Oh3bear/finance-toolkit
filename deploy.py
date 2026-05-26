import json, os, base64, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

TOKEN = os.environ.get('GITHUB_TOKEN', '')
OWNER = 'Oh3bear'
REPO = 'finance-toolkit'
BRANCH = 'main'
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')

def api_request(method, url, data=None):
    headers = {
        'Authorization': f'token {TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
    }
    if data:
        headers['Content-Type'] = 'application/json'
    req = Request(url, data=data.encode() if data else None, headers=headers, method=method)
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        body = e.read().decode()
        return json.loads(body) if body else {'message': str(e)}

def get_sha(path):
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path}?ref={BRANCH}'
    data = api_request('GET', url)
    return data.get('sha') if 'sha' in data else None

def upload_file(local_path, remote_path):
    sha = get_sha(remote_path)
    with open(local_path, 'rb') as f:
        content = base64.b64encode(f.read()).decode()
    
    payload = {'message': f'deploy: update {remote_path}', 'content': content, 'branch': BRANCH}
    if sha:
        payload['sha'] = sha
    
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{remote_path}'
    result = api_request('PUT', url, json.dumps(payload))
    
    if 'content' in result:
        print(f'  OK {remote_path}')
    else:
        print(f'  FAIL {remote_path}: {result.get("message", "unknown")}')

def main():
    print('Uploading dist files to GitHub Pages...')
    for root, dirs, files in os.walk(DIST_DIR):
        for fname in files:
            local = os.path.join(root, fname)
            remote = os.path.relpath(local, DIST_DIR).replace('\\', '/')
            upload_file(local, remote)
    print('Deploy complete!')
    print(f'https://oh3bear.github.io/finance-toolkit/')

if __name__ == '__main__':
    main()
