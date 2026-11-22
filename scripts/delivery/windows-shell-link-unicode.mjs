// IShellLinkW's documented vtable and IPersistFile preserve Unicode paths.
// https://learn.microsoft.com/windows/win32/api/shobjidl_core/nn-shobjidl_core-ishelllinkw
export const unicodeShellLinkSource=String.raw`
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
[ComImport, Guid("00021401-0000-0000-C000-000000000046")]
class CocoCutShellLinkObject {}
[ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICocoCutShellLinkW {
 void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path,int count,IntPtr findData,uint flags);
 void GetIDList(out IntPtr list);
 void SetIDList(IntPtr list);
 void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value,int count);
 void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
 void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value,int count);
 void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string value);
 void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value,int count);
 void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string value);
 void GetHotkey(out short key);
 void SetHotkey(short key);
 void GetShowCmd(out int command);
 void SetShowCmd(int command);
 void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path,int count,out int index);
 void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path,int index);
 void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path,uint reserved);
 void Resolve(IntPtr window,uint flags);
 void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
}
public static class CocoCutShellLinkW {
 public static string[] Read(string file) {
  object instance=new CocoCutShellLinkObject();
  try {
   ((IPersistFile)instance).Load(file,0);
   var link=(ICocoCutShellLinkW)instance;
   var target=new StringBuilder(32768);link.GetPath(target,target.Capacity,IntPtr.Zero,4);
   var icon=new StringBuilder(32768);int index;link.GetIconLocation(icon,icon.Capacity,out index);
   return new string[]{target.ToString(),icon.Length>0?icon.ToString()+","+index.ToString():""};
  } finally {Marshal.FinalReleaseComObject(instance);}
 }
 // Only the isolated regression fixture calls Create; installed verification
 // uses Read exclusively and never repairs an installed shortcut.
 public static void Create(string file,string target) {
  object instance=new CocoCutShellLinkObject();
  try {
   var link=(ICocoCutShellLinkW)instance;link.SetPath(target);link.SetIconLocation(target,0);
   ((IPersistFile)instance).Save(file,true);
  } finally {Marshal.FinalReleaseComObject(instance);}
 }
}
`;
