import { FleekSdk, PersonalAccessTokenService } from '@fleekxyz/sdk';
import {
  confirm,
  intro,
  outro,
  text,
  spinner,
  isCancel,
  cancel,
  select
} from '@clack/prompts';
import color from "picocolors";
import fs from 'fs';

const FLEEK_PAT = '<your-personal-access-token>';
const PROJECT_ID = '<your-project-id>';

const getFleekSDK = () => {
  const accessTokenService = new PersonalAccessTokenService({
    personalAccessToken: FLEEK_PAT,
    projectId: PROJECT_ID
  });
  

  return new FleekSdk({ accessTokenService: accessTokenService });
};

const uploadFileToIPFS = async (fleekSDK, filePath) => {
  const ipfsFile = {
    path: filePath,
    content: await fs.promises.readFile(filePath),
  }

  return fleekSDK.ipfs().add(ipfsFile);
};

const createIPNSName =  async (fleekSDK) => {
  return await fleekSDK.ipns().createRecord();
};

const listIPNSRecords = async (fleekSDK) => {
  return await fleekSDK.ipns().listRecords();
};

const publishIPNSRecord = async (fleekSDK, uploadFileResult, ipnsRecord) => {
  return await fleekSDK.ipns().publishRecord({
    id: ipnsRecord.id,
    hash: uploadFileResult.cid.toString()
  });
};


const updateIPNSRecord = async (sdk, uploadFileResult, ipnsRecord) => {
  const s =  spinner();

  s.start('Updating IPNS record...');

  const publishResult = await publishIPNSRecord(sdk, uploadFileResult, ipnsRecord);

  s.stop(`IPNS record updated! The new CID is => ${color.blue(publishResult.hash)}`);

  finishProcess(uploadFileResult, ipnsRecord);
};

const createIPNSRecord =  async (sdk) => {
  const s = spinner();

  s.start('Creating IPNS record...');
  const record = await createIPNSName(sdk);
  s.stop(`IPNS record created! The ID is => ${color.blue(record.id)}`);

  return record;
};

const handleCancel = (value) => {
  if (isCancel(value)) {
    cancel("You canceled the process...");
    return process.exit(0);
  }
};

const promptFileDirection = async () => {
  const filePath = await text({
    message: 'What file do you want to upload?',
    placeholder: './test.txt',
    validate(value) {
      if (!fs.existsSync(value)) return `Whoops! ${value} doesn't exist!`;
    },
  });
  
  handleCancel(filePath);

  return filePath;
};

const uploadFile = async (sdk, filePath) => {
  const s = spinner();

  s.start('Uploading file to IPFS...');

  const uploadFileResult = await uploadFileToIPFS(sdk,filePath);

  s.stop(
    `File uploaded! The CID is => ${color.blue(uploadFileResult.cid)}`
  );

  return uploadFileResult;
};

const promptIPNSUpload = async (sdk, uploadFileResult) => {
  const shouldUploadToIPNS = await confirm({
    message: 'Do you want to update an IPNS record with this CID?',
  });

  handleCancel(shouldUploadToIPNS);

  if (!shouldUploadToIPNS) {
    finishProcess(uploadFileResult);
    return;
  }

  const ipnsRecord = await getIPNSRecord(sdk, uploadFileResult);

  return await updateIPNSRecord(sdk, uploadFileResult, ipnsRecord);
};

const finishProcess = (uploadFileResult, ipnsRecord) => {
  outro(`You can find your file at:
  \n  IPFS Gateway: ${color.blue("https://ipfs.io/ipfs/" + uploadFileResult.cid)}
  ${ipnsRecord ?
      `\n  IPNS Gateway: ${color.blue("https://ipfs.io/ipns/" + ipnsRecord.name)}`: ''
  }`);
  return process.exit(0);
};

const getIPNSRecord = async (sdk, uploadFileResult) => {
  const s = spinner();

  s.start('Getting available IPNS records...');
  const records = await await listIPNSRecords(sdk);

  if (records.length === 0) {
    s.stop('No IPNS records found.');

    const shouldCreateIPNSRecord = await confirm({
      message: 'Do you want to create an IPNS record and publish it with the IPFS CID?',
    });

    if (isCancel(shouldCreateIPNSRecord)) {
      finishProcess(uploadFileResult);
      handleCancel(shouldCreateIPNSRecord);
    }

    if (shouldCreateIPNSRecord) {
      const ipnsRecord = await createIPNSRecord(sdk);
      await updateIPNSRecord(sdk, uploadFileResult, ipnsRecord);
    }

    return finishProcess(uploadFileResult);
  }

  s.stop(`Found ${records.length} IPNS records.`);

  const ipnsRecord = await select({
    message: 'Select the IPNS record you want to update',
    options: records.map((record) => ({
      label: record.id,
      value: record,
    }))
  });

  return ipnsRecord;
};

async function main() {
  intro(color.bgBlue(' Welcome to your file uploader! '));

  const fleekSDK = getFleekSDK();

  const file = await promptFileDirection();
  const uploadFileResult = await uploadFile(fleekSDK, file);
  await promptIPNSUpload(fleekSDK, uploadFileResult);

  return process.exit(0);
};

main().catch(console.error);
