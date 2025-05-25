sudo dnf install mariadb105 -y
mysql -h app-db.chww2bwqhy2u.us-east-1.rds.amazonaws.com -u admin -ppassword123 app < schema.sql