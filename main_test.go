package main
import("archive/zip";"bytes";"os";"path/filepath";"testing")
func makeZip(name,content string)[]byte{var b bytes.Buffer;w:=zip.NewWriter(&b);f,_:=w.Create(name);f.Write([]byte(content));w.Close();return b.Bytes()}
func TestExtraction(t *testing.T){d:=filepath.Join(t.TempDir(),"new");if e:=extract(makeZip("sub/a.txt","verified"),d);e!=nil{t.Fatal(e)};b,e:=os.ReadFile(filepath.Join(d,"sub/a.txt"));if e!=nil||string(b)!="verified"{t.Fatal("bad contents")};if e:=extract(makeZip("a.txt","new"),d);e==nil{t.Fatal("overwrote existing directory")}}
func TestTraversal(t *testing.T){for _,name:=range []string{"../escape","/absolute","a\\b"}{d:=filepath.Join(t.TempDir(),"new");if e:=extract(makeZip(name,"bad"),d);e==nil{t.Fatal("accepted",name)};if _,e:=os.Stat(d);!os.IsNotExist(e){t.Fatal("created directory before validation")}}}
func TestEmbeddedPayload(t *testing.T){d:=filepath.Join(t.TempDir(),"payload");if e:=extract(payload,d);e!=nil{t.Fatal(e)};b,e:=os.ReadFile(filepath.Join(d,"CaptureEvidence.html"));if e!=nil||!bytes.Contains(b,[]byte("CaptureEvidence")){t.Fatal("missing application")}}
