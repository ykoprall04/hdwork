# SYSTEM-only local pipe supplies the native cloudflared --token-file reader.
# No plaintext credential file, command-line token, Cloudflare API or DNS call.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
while($true){
    $pipe=$null;$bytes=$null;$stage='CREATE_PIPE'
    try{
        $acl=New-Object IO.Pipes.PipeSecurity
        $sid=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
        $acl.AddAccessRule((New-Object IO.Pipes.PipeAccessRule($sid,'FullControl','Allow')))
        $pipe=New-Object IO.Pipes.NamedPipeServerStream('HDWork2TunnelToken',[IO.Pipes.PipeDirection]::Out,1,[IO.Pipes.PipeTransmissionMode]::Byte,[IO.Pipes.PipeOptions]::None,4096,4096,$acl)
        [IO.File]::WriteAllText('C:\ProgramData\HDWork2\cloudflared\broker.state.json',(@{status='WAITING';stage='LOCAL_PIPE';secretLogged=$false}|ConvertTo-Json))
        $pipe.WaitForConnection()
        $stage='DECRYPT_TOKEN'
        $cipher=[IO.File]::ReadAllBytes('C:\ProgramData\HDWork2\cloudflared\tunnel-token.dpapi')
        $bytes=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
        $stage='PIPE_DELIVERY'
        $pipe.Write($bytes,0,$bytes.Length);$pipe.Flush();$pipe.WaitForPipeDrain()
    }catch{[IO.File]::WriteAllText('C:\ProgramData\HDWork2\cloudflared\broker.state.json',(@{status='RETRY';stage=$stage;errorType=$_.Exception.GetType().Name;nativeResult=$_.Exception.HResult;secretLogged=$false}|ConvertTo-Json));Start-Sleep -Seconds 3}
    finally{if($bytes){[Array]::Clear($bytes,0,$bytes.Length)};if($pipe){$pipe.Dispose()}}
}
