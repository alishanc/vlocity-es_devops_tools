import { flags, SfdxCommand } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import { AppUtils } from '../../../utils/AppUtils';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('vlocityestools', 'deltapackage');

export default class deltaPackage extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
  `$ sfdx vlocityestools:sfsource:createdeltapackage -u myOrg@example.com -p cmt -d 'force-app'
  `,
  `$ sfdx vlocityestools:sfsource:createdeltapackage --targetusername myOrg@example.com --package ins --sourcefolder 'force-app'
  `
  ];

  public static args = [{name: 'file'}];

  protected static flagsConfig = {
    package: flags.string({char: 'p', description: messages.getMessage('packageType')}),
    sourcefolder: flags.string({char: 'd', description: messages.getMessage('sourcefolder')}),
  };

  protected static requiresUsername = true;


  public async run(){
    var packageType = this.flags.package;
    var sourceFolder = this.flags.sourcefolder;

    if(packageType == 'cmt'){
      AppUtils.namespace = 'vlocity_cmt__';
    } else if(packageType == 'ins'){
      AppUtils.namespace = 'vlocity_ins__';
    } else {
      throw new Error("Error: -p, --package has to be either cmt or ins ");
    }
    
    AppUtils.logInitial(messages.getMessage('command'));

    const conn = this.org.getConnection();
    const initialQuery = "SELECT Name, %name-space%Value__c FROM %name-space%GeneralSettings__c WHERE Name = 'VBTDeployKey'";
    const query = AppUtils.replaceaNameSpace(initialQuery);
    const result = await conn.query(query);
    const repoPath = './';
    const simpleGit = require('simple-git')(repoPath);

    if(result.records.length < 1){
      AppUtils.log2('Hash not found in the environment, Coping full Paackage');
    }
    else if(!simpleGit.checkIsRepo()){
      AppUtils.log2('Current directory is not a repository');
    }
    else {
      var previousHash = result.records[0][AppUtils.replaceaNameSpace('%name-space%Value__c')];
      AppUtils.log2('Hash found in the environment: ' + previousHash);
      
      AppUtils.log2('Creating delta Package');
      
      var deltaPackageFolder = sourceFolder + '_delta';
      const fsExtra = require('fs-extra');
      if(fsExtra.existsSync(deltaPackageFolder)){
        fsExtra.removeSync(deltaPackageFolder);
      }

      deltaPackage.doDelta(simpleGit,sourceFolder,deltaPackageFolder,fsExtra,previousHash);
       
    }
  }

  static doDelta(simpleGit,sourceFolder,deltaPackageFolder,fsExtra,previousHash) {
    AppUtils.log2('Deltas: ');
    simpleGit.diffSummary([previousHash],(err, status) => {
      //console.log(status.files);
      status.files.forEach(files => {
        //console.log('File: ' + files.file);
        var filePath = files.file;       
        if(fsExtra.existsSync(filePath) && filePath.includes(sourceFolder)) {
          var newfilePath = filePath.replace(sourceFolder, deltaPackageFolder);
          AppUtils.log1('File: ' + filePath ) //+ ' /////// newfilePath: ' + newfilePath);

          if(filePath.includes("/aura/") || filePath.includes("/lwc/")){
            var splitResult = filePath.split("/");
            var CompPath = splitResult[0] + '/' + splitResult[1] + '/' + splitResult[2] + '/' + splitResult[3] + '/' + splitResult[4] 
            var newCompPath = CompPath.replace(sourceFolder, deltaPackageFolder);
            //console.log('CompPath: ' + CompPath + ' /////// newCompPath: ' + newCompPath);
            if(fsExtra.existsSync(newCompPath) == false){ 
              fsExtra.copySync(CompPath,newCompPath);
            }
          }
          else {
            fsExtra.copySync(filePath,newfilePath);
          }

          var metaXMLFile = filePath + '-meta.xml';
          if(fsExtra.existsSync(metaXMLFile)){
            var newMetaXMLFile = newfilePath + '-meta.xml';
            fsExtra.copySync(metaXMLFile,newMetaXMLFile);
          }
        } 
     });
    });
  }

}
