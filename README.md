# edge-reports-server

> Reporting tools and GUI for partner revenue share

## Installation

```sh
# Install Yarn

    https://linuxize.com/post/how-to-install-yarn-on-ubuntu-18-04/

# Install Node

    curl -sL https://deb.nodesource.com/setup_10.x -o nodesource_setup.sh
    sudo bash nodesource_setup.sh

# Run Yarn

    yarn

# Install CouchDB v3.1

    sudo apt-get install -y apt-transport-https gnupg ca-certificates
    echo "deb https://apache.bintray.com/couchdb-deb bionic main" \
    | sudo tee -a /etc/apt/sources.list.d/couchdb.list

    sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 8756C4F765C9AC3CB6B85D62379CE192D401AB61
    sudo apt update
    sudo apt-get install couchdb=3.1.0~bionic
    # install standalone
    # bind address = 127.0.0.1

    # Test that couch is running
    curl http://localhost:5984/
```

## Reporting Server

To launch the reports server, just type `yarn start`.

You can also build the server code by running `yarn build`, which puts its output in the `lib` folder. You can then use `forever-service` or similar tools to install the software on your server machine.

```sh

# install forever-service:
sudo npm i -global forever-service

# install:
sudo forever-service install reportsQuery --script lib/indexEngine.js --start
sudo forever-service install reportsRates --script lib/indexRatesEngine.js --start
sudo forever-service install reportsApi --script lib/indexApi.js --start

# manage:
sudo service reportsQuery restart
sudo service reportsQuery stop
sudo service reportsRates restart
sudo service reportsRates stop
sudo service reportsApi restart
sudo service reportsApi stop

# uninstall:
sudo forever-service delete reportsQuery
sudo forever-service delete reportsRates
sudo forever-service delete reportsApi
```

## Demo app

Run `yarn demo` to launch the demo app in your web browser.
