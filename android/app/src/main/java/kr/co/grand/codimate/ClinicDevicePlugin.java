package kr.co.grand.codimate;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.print.PrintManager;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.core.content.FileProvider;
import android.app.Activity;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import org.json.JSONObject;
import java.util.ArrayList;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name="ClinicDevice")
public class ClinicDevicePlugin extends Plugin {
  @PluginMethod public void setStylusEditor(PluginCall call) {
    String id = call.getString("id", "");
    boolean active = call.getBoolean("active", false);
    if (id.isEmpty() || id.length() > 100) { call.reject("Invalid editor id"); return; }
    getActivity().runOnUiThread(() -> {
      if (getActivity() instanceof MainActivity) {
        ((MainActivity)getActivity()).setStylusEditor(id, active);
        call.resolve();
      } else call.reject("Editor input is unavailable");
    });
  }
  @PluginMethod public void openDeviceSettings(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      try { getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS)); call.resolve(); }
      catch (Exception e) { call.reject("기기 설정을 열지 못했습니다"); }
    });
  }
  private volatile boolean savingDocuments=false;
  @PluginMethod public void saveDocuments(PluginCall call) {
    if(savingDocuments){call.reject("문서 저장이 진행 중입니다");return;}
    try {
      JSArray files=call.getArray("files");
      if(files==null||files.length()==0)throw new IOException();
      for(int i=0;i<files.length();i++){
        JSONObject f=files.getJSONObject(i);String mime=f.getString("mimeType"),name=f.getString("name");
        if((!mime.equals("application/pdf")&&!mime.equals("image/jpeg"))||name.isEmpty()||name.contains("/")||name.contains("\\")||f.getString("data").isEmpty())throw new IOException();
      }
      Intent intent;
      if(files.length()==1){JSONObject f=files.getJSONObject(0);intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(f.getString("mimeType")).putExtra(Intent.EXTRA_TITLE,f.getString("name"));}
      else intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
      savingDocuments=true;startActivityForResult(call,intent,"documentsDestination");
    } catch(Exception e){savingDocuments=false;call.reject("저장할 문서 또는 파일 저장 앱을 확인해주세요");}
  }
  @ActivityCallback private void documentsDestination(PluginCall call, ActivityResult result) {
    if(call==null){savingDocuments=false;return;}
    if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){savingDocuments=false;JSObject response=new JSObject();response.put("cancelled",true);call.resolve(response);return;}
    Uri destination=result.getData().getData();
    getBridge().execute(()->{
      ArrayList<Uri> created=new ArrayList<>();
      try{
        JSArray files=call.getArray("files");
        Uri parent=files.length()>1?DocumentsContract.buildDocumentUriUsingTree(destination,DocumentsContract.getTreeDocumentId(destination)):null;
        for(int i=0;i<files.length();i++){
          JSONObject f=files.getJSONObject(i);
          Uri target=parent==null?destination:DocumentsContract.createDocument(getContext().getContentResolver(),parent,f.getString("mimeType"),f.getString("name"));
          if(target==null)throw new IOException();created.add(target);
          byte[] data=Base64.decode(f.getString("data"),Base64.DEFAULT);
          if(data.length==0)throw new IOException();
          try(OutputStream out=getContext().getContentResolver().openOutputStream(target,"w")){if(out==null)throw new IOException();out.write(data);out.flush();}
        }
        JSObject response=new JSObject();response.put("cancelled",false);response.put("count",files.length());call.resolve(response);
      }catch(Exception e){
        for(Uri uri:created)try{DocumentsContract.deleteDocument(getContext().getContentResolver(),uri);}catch(Exception ignored){}
        call.reject("파일을 저장하지 못했습니다. 저장 공간과 선택한 위치를 확인한 뒤 다시 시도해주세요");
      }finally{savingDocuments=false;}
    });
  }
  @PluginMethod public void appInfo(PluginCall call) {
    try {
      android.content.pm.PackageInfo info=getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),0);
      JSObject result=new JSObject();result.put("version",info.versionName);
      result.put("versionCode",Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode);
      call.resolve(result);
    } catch(Exception e) {call.reject("설치된 앱 버전을 확인하지 못했습니다");}
  }
  private SecretKey key() throws Exception {
    KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
    String alias="codimate-vault-v1";
    if(!store.containsAlias(alias)) {
      KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
      gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());gen.generateKey();
    }
    return (SecretKey)store.getKey(alias,null);
  }
  @PluginMethod public void seal(PluginCall call) {
    try{Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());
      byte[] enc=c.doFinal(call.getString("value","").getBytes("UTF-8"));
      JSObject result=new JSObject();result.put("value",Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(enc,Base64.NO_WRAP));call.resolve(result);
    }catch(Exception e){call.reject("기기 암호화 실패");}
  }
  @PluginMethod public void open(PluginCall call) {
    try{String[] p=call.getString("value","").split(":",2);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(p[0],Base64.NO_WRAP)));
      JSObject result=new JSObject();result.put("value",new String(c.doFinal(Base64.decode(p[1],Base64.NO_WRAP)),"UTF-8"));call.resolve(result);
    }catch(Exception e){call.reject("기기 저장 복호화 실패");}
  }
  @PluginMethod public void print(PluginCall call) {
    getActivity().runOnUiThread(()->{
      try {
        PrintManager manager=(PrintManager)getContext().getSystemService(android.content.Context.PRINT_SERVICE);
        android.print.PrintDocumentAdapter document=getBridge().getWebView().createPrintDocumentAdapter("코디메이트");
        manager.print("코디메이트 견적서",new android.print.PrintDocumentAdapter(){
          @Override public void onStart(){document.onStart();}
          @Override public void onLayout(android.print.PrintAttributes oldAttributes,android.print.PrintAttributes newAttributes,android.os.CancellationSignal signal,LayoutResultCallback callback,android.os.Bundle extras){document.onLayout(oldAttributes,newAttributes,signal,callback,extras);}
          @Override public void onWrite(android.print.PageRange[] pages,android.os.ParcelFileDescriptor destination,android.os.CancellationSignal signal,WriteResultCallback callback){document.onWrite(pages,destination,signal,callback);}
          @Override public void onFinish(){try{document.onFinish();}finally{call.resolve();}}
        },new android.print.PrintAttributes.Builder().setMediaSize(android.print.PrintAttributes.MediaSize.ISO_A4).build());
      }catch(Exception e){call.reject("인쇄를 시작하지 못했습니다. 인쇄 서비스를 확인한 뒤 다시 시도해주세요.");}
    });
  }
  @PluginMethod public void install(PluginCall call) {
    String url=call.getString("url", ""),expected=call.getString("sha256", "");
    if(!url.startsWith("https://")||!expected.matches("[a-fA-F0-9]{64}")){call.reject("업데이트 주소·해시를 확인하세요");return;}
    if(Build.VERSION.SDK_INT>=26&&!getContext().getPackageManager().canRequestPackageInstalls()){
      getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getContext().getPackageName())));call.reject("이 앱의 설치 허용 후 다시 눌러주세요");return;
    }
    getBridge().execute(()->{try{
      File target=new File(getContext().getCacheDir(),"codimate-update.apk");
      URL connectionUrl=new URL(url);HttpURLConnection con=null;
      for(int redirects=0;redirects<6;redirects++){if(!connectionUrl.getProtocol().equals("https"))throw new IOException();con=(HttpURLConnection)connectionUrl.openConnection();con.setConnectTimeout(30000);con.setReadTimeout(30000);con.setInstanceFollowRedirects(false);int code=con.getResponseCode();if(code>=300&&code<400){connectionUrl=new URL(connectionUrl,con.getHeaderField("Location"));con.disconnect();continue;}if(code!=200)throw new IOException();break;}
      MessageDigest digest=MessageDigest.getInstance("SHA-256");long total=0;
      try(InputStream in=con.getInputStream();OutputStream out=new FileOutputStream(target)){byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1){total+=n;if(total>150_000_000)throw new IOException();digest.update(buf,0,n);out.write(buf,0,n);}}
      StringBuilder actual=new StringBuilder();for(byte b:digest.digest())actual.append(String.format("%02x",b));if(!actual.toString().equalsIgnoreCase(expected)){target.delete();call.reject("APK 무결성 확인 실패");return;}
      android.content.pm.PackageInfo downloaded=getContext().getPackageManager().getPackageArchiveInfo(target.getAbsolutePath(),0);
      android.content.pm.PackageInfo current=getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),0);
      if(downloaded==null||!getContext().getPackageName().equals(downloaded.packageName)) {target.delete();call.reject("코디메이트 설치 파일이 아닙니다");return;}
      long downloadedCode=Build.VERSION.SDK_INT>=28?downloaded.getLongVersionCode():downloaded.versionCode;
      long currentCode=Build.VERSION.SDK_INT>=28?current.getLongVersionCode():current.versionCode;
      if(downloadedCode<=currentCode) {target.delete();call.reject("이미 같은 버전 또는 더 최신 버전을 사용 중입니다");return;}
      Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",target);
      Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);getContext().startActivity(intent);call.resolve();
    }catch(Exception e){call.reject("업데이트 다운로드 실패. 다시 시도하세요");}});
  }
}
