# Scheduler schema requires RestartOnFailure/Count >=1. Absence means no failure retry.
function SetRawLogNoFailureRestart {
 [CmdletBinding()]
 param([Parameter(Mandatory=$true)][ValidateSet('HDWork2-Web','HDWork2-LiveChat-Courier')][string]$TaskName)
 if(-not (Get-Command Register-ScheduledTask -ErrorAction Stop).Parameters.ContainsKey('Xml')){throw 'TASK_XML_UPDATE_UNAVAILABLE'}
 [xml]$xml=Export-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction Stop
 $ns=New-Object Xml.XmlNamespaceManager($xml.NameTable)
 $ns.AddNamespace('t',$xml.DocumentElement.NamespaceURI)
 if($xml.SelectSingleNode('/t:Task/t:Triggers/t:RegistrationTrigger',$ns)){throw 'REGISTRATION_TRIGGER_REQUIRES_REVIEW'}
 $instances=$xml.SelectSingleNode('/t:Task/t:Settings/t:MultipleInstancesPolicy',$ns)
 if($instances -and $instances.InnerText -ne 'IgnoreNew'){throw 'IGNORE_NEW_INSTANCE_POLICY_REQUIRED'}
 $restart=$xml.SelectSingleNode('/t:Task/t:Settings/t:RestartOnFailure',$ns)
 if($restart){
  [void]$restart.ParentNode.RemoveChild($restart)
  Register-ScheduledTask -TaskPath '\' -TaskName $TaskName -Xml $xml.OuterXml -Force -ErrorAction Stop|Out-Null
 }
 [xml]$verified=Export-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction Stop
 $ns2=New-Object Xml.XmlNamespaceManager($verified.NameTable);$ns2.AddNamespace('t',$verified.DocumentElement.NamespaceURI)
 if($verified.SelectSingleNode('/t:Task/t:Settings/t:RestartOnFailure',$ns2)){throw ('FAILURE_RESTART_POLICY_STILL_PRESENT_'+$TaskName)}
}
