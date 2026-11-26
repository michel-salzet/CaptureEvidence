package main

import (
 "archive/zip"
 "bytes"
 _ "embed"
 "errors"
 "flag"
 "fmt"
 "io"
 "net/url"
 "os"
 "os/exec"
 "path/filepath"
 "runtime"
 "strings"
)

//go:embed payload.zip
var payload []byte

func extract(data []byte, dest string) error {
 r, err := zip.NewReader(bytes.NewReader(data), int64(len(data))); if err != nil {return err}
 var total uint64
 for _, f := range r.File {
  name := f.Name
  if !filepath.IsLocal(name) || strings.Contains(name, "\\") || f.Mode()&os.ModeSymlink != 0 {return errors.New("unsafe archive entry")}
  total += f.UncompressedSize64; if total > 100<<20 {return errors.New("archive exceeds 100 MB limit")}
 }
 if err := os.Mkdir(dest,0700);err!=nil{return fmt.Errorf("destination must not exist: %w",err)}
 ok:=false;defer func(){if !ok{os.RemoveAll(dest)}}()
 for _,f:=range r.File{
  target:=filepath.Join(dest,f.Name)
  if f.FileInfo().IsDir(){if err:=os.MkdirAll(target,0700);err!=nil{return err};continue}
  if err:=os.MkdirAll(filepath.Dir(target),0700);err!=nil{return err}
  in,err:=f.Open();if err!=nil{return err}
  out,err:=os.OpenFile(target,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600);if err!=nil{in.Close();return err}
  _,err=io.Copy(out,io.LimitReader(in,int64(f.UncompressedSize64)+1));ce:=out.Close();in.Close();if err!=nil{return err};if ce!=nil{return ce}
 }
 ok=true;return nil
}

func run() error {
 dest:=flag.String("extract","","Extract into a new directory instead of Desktop")
 noOpen:=flag.Bool("no-open",false,"Extract without opening the browser")
 flag.Parse()
 if *dest=="" {
  home,err:=os.UserHomeDir();if err!=nil{return err};base:=filepath.Join(home,"Desktop")
  if info,err:=os.Stat(base);err!=nil||!info.IsDir(){base=home}
  for n:=1;;n++{p:=filepath.Join(base,fmt.Sprintf("CaptureEvidence-1.0.0-%d",n));if _,err:=os.Lstat(p);os.IsNotExist(err){*dest=p;break}}
 }
 abs,err:=filepath.Abs(*dest);if err!=nil{return err}
 if err:=extract(payload,abs);err!=nil{return err};fmt.Println("Extracted CaptureEvidence to",abs)
 if *noOpen{return nil}
 page:=filepath.Join(abs,"CaptureEvidence.html")
 switch runtime.GOOS {
 case "darwin": return exec.Command("open",page).Run()
 case "windows":
  u:=url.URL{Scheme:"file",Path:"/"+filepath.ToSlash(page)}
  return exec.Command("rundll32.exe","url.dll,FileProtocolHandler",u.String()).Run()
 default:return exec.Command("xdg-open",page).Run()
 }
}
func main(){if err:=run();err!=nil{fmt.Fprintln(os.Stderr,"CaptureEvidence:",err);os.Exit(1)}}
