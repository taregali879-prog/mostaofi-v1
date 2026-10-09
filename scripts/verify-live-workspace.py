import sys,json,urllib.request,urllib.error,http.cookiejar,uuid,base64,hashlib,hmac,time
s=json.loads(sys.stdin.readline());base='https://mostaofi.sa/api/live';checks=[]
jar=http.cookiejar.CookieJar();op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(path,method='GET',body=None,expected=200,extra={},binary=False):
 data=body if binary else (json.dumps(body).encode() if body is not None else None)
 headers={'User-Agent':'Mozilla/5.0','Accept':'application/json','Origin':'https://mostaofi.sa','x-mostaofi-action':'1','Content-Type':'application/json',**extra}
 try:r=op.open(urllib.request.Request(base+path,data=data,method=method,headers=headers),timeout=25)
 except urllib.error.HTTPError as e:r=e
 raw=r.read()
 if r.status not in (expected if isinstance(expected,list) else [expected]):raise Exception(f'{method} {path}: {r.status}, expected {expected}')
 return raw if binary else json.loads(raw)
payload=base64.urlsafe_b64encode(json.dumps({'email':'taregali879@gmail.com','purpose':'registration','expiresAt':int(time.time()*1000)+86400000},separators=(',',':')).encode()).decode().rstrip('=')
sig=base64.urlsafe_b64encode(hmac.new(s['key'].encode(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=')
invite=payload+'.'+sig
identity=call('/session/invitation','POST',{'invitationToken':invite});assert identity['email']=='taregali879@gmail.com';checks.append('published invitation endpoint validated owner activation')
call('/session/login','POST',{'email':'release-check-20261009@mostaofi.sa','password':s['password']});projects=call('/projects');p=next(p for p in projects if p['name']=='اختبار الحفظ الفعلي — 2026-10-09');path='/projects/'+p['id']+'/features'
state=call(path);sku='PERSIST-CHECK-20261009';existing=next((x for x in state['state']['catalog'] if x['sku']==sku),None)
if not existing:
 state=call(path+'/commands','POST',{'operationId':str(uuid.uuid4()),'expectedVersion':state['version'],'command':{'type':'CATALOG_ADD','payload':{'sku':sku,'name':'صنف اختبار حفظ — ليس للبيع','brand':'Verification','model':'Test','unit':'ea','price':1}}})
checks.append('authenticated site command saved to live D1')
image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nWQAAAAASUVORK5CYII=')
f=call(path+'/files','POST',image,[200,201],{'Content-Type':'image/png','x-file-name':'persistence-check.png'},True)
f=json.loads(f);read=call(path+'/files/'+f['id'],binary=True);assert read==image;checks.append('private R2 file saved and retrieved with identical bytes')
call('/session/logout','POST',{});call('/session/login','POST',{'email':'release-check-20261009@mostaofi.sa','password':s['password']});state=call(path);assert any(x['sku']==sku for x in state['state']['catalog']);checks.append('saved D1 state reread after logout and new login')
call('/session/logout','POST',{});call('/session/login','POST',{'email':'release-isolation-20261009@mostaofi.sa','password':s['password2']});call(path,expected=404);call(path+'/files/'+f['id'],expected=404);checks.append('other organization denied D1 state and R2 file access');call('/session/logout','POST',{})
print(json.dumps({'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'projectId':p['id'],'checks':checks},ensure_ascii=False,indent=2),flush=True)
with open('/tmp/mostaofi-owner-invitation','w') as out:out.write('https://mostaofi.sa/#activate='+invite)
