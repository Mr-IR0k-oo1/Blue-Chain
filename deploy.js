// scripts/deploy.js
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const BlueCarbonCredit = await ethers.getContractFactory("BlueCarbonCredit");
  const bcc = await BlueCarbonCredit.deploy();
  await bcc.deployed();

  console.log("BlueCarbonCredit deployed to:", bcc.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
