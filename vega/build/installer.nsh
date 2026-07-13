!macro customInstall
  SetShellVarContext all
  CreateDirectory "$APPDATA\Vega\Audit"
  nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$APPDATA\Vega\Audit" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F"'
  Pop $0
  Pop $1
  StrCmp $0 "0" acl_ok
    MessageBox MB_ICONSTOP "Não foi possível proteger o diretório de auditoria do Vega. A instalação será cancelada."
    Abort
  acl_ok:
!macroend

!macro customUnInstall
  SetShellVarContext all
  RMDir /r "$APPDATA\Vega"
!macroend
