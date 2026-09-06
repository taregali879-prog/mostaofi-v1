import importlib.util, json, pathlib, subprocess, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('integrity',ROOT/'scripts/verify-s1-evidence.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class EvidenceIntegrity(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.out=pathlib.Path(self.tmp.name)/'evidence'
        self.sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        result=subprocess.run(['python3','scripts/run-s1-evidence.py','--mode','dry-run-blocked','--output',str(self.out)],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(result.returncode,2,result.stderr)
    def tearDown(self): self.tmp.cleanup()
    def test_valid_integrity_is_not_acceptance(self):
        r=module.evaluate(self.out,self.sha)
        self.assertEqual(r['evidenceIntegrity'],'VERIFIED');self.assertEqual(r['automatedDecision'],'NO-GO')
    def test_tampering_fails(self):
        p=self.out/'runtime-preflight.json';p.write_text('{}')
        self.assertEqual(module.evaluate(self.out,self.sha)['evidenceIntegrity'],'FAILED')
    def test_missing_file_fails(self):
        (self.out/'test-summary.json').unlink()
        self.assertEqual(module.evaluate(self.out,self.sha)['evidenceIntegrity'],'FAILED')
    def test_wrong_commit_rejected(self):
        r=module.evaluate(self.out,'0'*40)
        self.assertEqual(r['automatedDecision'],'NO-GO');self.assertIn('IDENTITY_commitSha',r['blockers'])
    def test_history_cannot_be_overwritten(self):
        before=module.sha(self.out/'run-identity.json')
        r=subprocess.run(['python3','scripts/run-s1-evidence.py','--mode','dry-run-blocked','--output',str(self.out)],cwd=ROOT,capture_output=True)
        self.assertNotEqual(r.returncode,0);self.assertEqual(module.sha(self.out/'run-identity.json'),before)